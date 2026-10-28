import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderCancellationService } from './order-cancellation.service.js';
import { CUSTOMER_CANCELLABLE_STATUSES } from './order-rules.js';

// The service imports these two only so Nest can inject them. The tests hand it fakes instead,
// so the real database client and the real Stripe SDK are never loaded
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));

afterEach(() => {
  vi.restoreAllMocks(); // puts the real Logger methods back
});

// Waits for a call that must fail and gives back the error: the test checks its type and message
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// An order as it is stored. Each test starts from this and changes only what it is about
const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'Placed',
  paymentMethod: 'cash',
  isPaid: false,
  paymentIntentId: null,
  refundId: null,
  refundStatus: null,
  deliveryOtp: '123456',
  statusHistory: [],
  items: [
    { product: 'a', quantity: 2 },
    { product: 'b', quantity: 1 },
  ],
  ...overrides,
});

const paidCardOrder = (overrides: Record<string, unknown> = {}) =>
  makeOrder({
    paymentMethod: 'card',
    isPaid: true,
    paymentIntentId: 'pi_1',
    ...overrides,
  });

function setup() {
  // The transaction: every method answers with a sensible default, a test changes what it needs
  const tx = {
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
    },
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };

  const prisma = {
    // The real $transaction runs the function and returns what it returns: so does the fake
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
    order: {
      findUnique: vi.fn(),
      // Answers with the order as saved: its id plus the fields that were written
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'o1',
        ...data,
      })),
    },
  };

  const refundsCreate = vi.fn();
  const stripe = { client: { refunds: { create: refundsCreate } } };

  // The service writes to the log when something needs the admin's attention
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const errorLog = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);

  const service = new OrderCancellationService(
    prisma as never,
    stripe as never,
  );
  return { service, tx, prisma, refundsCreate, errorLog };
}

type Tx = ReturnType<typeof setup>['tx'];

// What the transaction reads first, and what it reads back after the update
function stored(
  tx: Tx,
  order: object,
  afterCancel: Record<string, unknown> = {},
) {
  tx.order.findFirst.mockResolvedValue(order);
  tx.order.findUniqueOrThrow.mockResolvedValue({
    ...order,
    status: 'Cancelled',
    ...afterCancel,
  });
}

describe('cancel', () => {
  it('cancels a cash order, puts its items back and does not touch Stripe', async () => {
    const { service, tx, refundsCreate } = setup();
    stored(tx, makeOrder());

    const result = await service.cancel('o1', { by: 'admin' });

    // The current status is part of the condition: nobody changed the order in between
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: 'Placed' },
      data: {
        status: 'Cancelled',
        deliveryOtp: '',
        statusHistory: [
          {
            status: 'Cancelled',
            note: 'Cancelled by the store',
            timestamp: expect.any(String),
          },
        ],
      },
    });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { stock: { increment: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'b' },
      data: { stock: { increment: 1 } },
    });
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(result.outcome).toBe('none');
    expect(result.order.status).toBe('Cancelled');
  });

  it('writes who cancelled and why, with the reason trimmed', async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder());

    await service.cancel('o1', {
      by: 'customer',
      userId: 'u1',
      reason: '  Ordered by mistake ',
    });

    const { data } = tx.order.updateMany.mock.calls[0][0];
    expect(data.statusHistory[0].note).toBe(
      'Cancelled by the customer: Ordered by mistake',
    );
  });

  it('ignores a reason that is only spaces', async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder());

    await service.cancel('o1', { by: 'courier', reason: '   ' });

    const { data } = tx.order.updateMany.mock.calls[0][0];
    expect(data.statusHistory[0].note).toBe('Cancelled by the courier');
  });

  it("looks the order up by its owner on the customer path, so another user's order is not found", async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder());

    await service.cancel('o1', { by: 'customer', userId: 'u1' });

    expect(tx.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'o1', userId: 'u1' },
    });
  });

  it('does not filter by owner on the admin path', async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder());

    await service.cancel('o1', { by: 'admin' });

    expect(tx.order.findFirst).toHaveBeenCalledWith({ where: { id: 'o1' } });
  });

  it('answers "not found" when the order does not exist (or belongs to someone else)', async () => {
    const { service, tx } = setup();
    tx.order.findFirst.mockResolvedValue(null);

    const error = await failureOf(
      service.cancel('o1', { by: 'customer', userId: 'u2' }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toHaveProperty('message', 'Order not found');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each(['Delivered', 'Cancelled'])(
    'refuses an order that is already %s',
    async (status) => {
      const { service, tx } = setup();
      stored(tx, makeOrder({ status }));

      const error = await failureOf(service.cancel('o1', { by: 'admin' }));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toHaveProperty('message', 'This order is already finished');
      expect(tx.order.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refuses a status that is not in allowedStatuses (the customer after packing)', async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder({ status: 'Packed' }));

    const error = await failureOf(
      service.cancel('o1', {
        by: 'customer',
        userId: 'u1',
        allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES,
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'This order can no longer be cancelled',
    );
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each(['Packed', 'Out for Delivery'])(
    'lets the admin cancel an order that is %s (no allowedStatuses)',
    async (status) => {
      const { service, tx } = setup();
      stored(tx, makeOrder({ status }));

      const result = await service.cancel('o1', { by: 'admin' });

      expect(result.order.status).toBe('Cancelled');
      expect(tx.order.updateMany).toHaveBeenCalledTimes(1);
    },
  );

  it('refuses a card order that has not been paid (it holds no stock and no money)', async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder({ paymentMethod: 'card', isPaid: false }));

    const error = await failureOf(service.cancel('o1', { by: 'admin' }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'This order is waiting for payment',
    );
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('stops with a conflict when the order changed in between, and puts nothing back', async () => {
    const { service, tx, refundsCreate } = setup();
    stored(tx, makeOrder());
    tx.order.updateMany.mockResolvedValue({ count: 0 }); // somebody else changed the status first

    const error = await failureOf(service.cancel('o1', { by: 'admin' }));

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('still cancels when the stored items are not a list', async () => {
    const { service, tx } = setup();
    stored(tx, makeOrder({ items: null }));

    const result = await service.cancel('o1', { by: 'admin' });

    expect(result.order.status).toBe('Cancelled');
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});

describe('the refund after a cancellation', () => {
  it('refunds a paid card order once, with an idempotency key', async () => {
    const { service, tx, prisma, refundsCreate } = setup();
    stored(tx, paidCardOrder());
    refundsCreate.mockResolvedValue({ id: 're_1', status: 'succeeded' });

    const result = await service.cancel('o1', { by: 'customer', userId: 'u1' });

    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(refundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        reason: 'requested_by_customer',
        metadata: { orderId: 'o1' },
      },
      // The same key always gives the same refund: a retry can never refund twice
      { idempotencyKey: 'refund-o1' },
    );
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { refundStatus: 'refunded', refundId: 're_1' },
    });
    expect(result.outcome).toBe('refunded');
    expect(result.order).toMatchObject({
      refundStatus: 'refunded',
      refundId: 're_1',
    });
  });

  it.each([
    ['succeeded', 'refunded'],
    ['pending', 'pending'],
    ['requires_action', 'pending'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
    [null, 'pending'],
  ])('records a Stripe status of %s as %s', async (stripeStatus, expected) => {
    const { service, tx, prisma, refundsCreate } = setup();
    stored(tx, paidCardOrder());
    refundsCreate.mockResolvedValue({ id: 're_1', status: stripeStatus });

    const result = await service.cancel('o1', { by: 'admin' });

    expect(result.outcome).toBe(expected);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { refundStatus: expected, refundId: 're_1' },
    });
  });

  it('never throws when Stripe fails: the cancellation stands and the failure is recorded', async () => {
    const { service, tx, prisma, refundsCreate, errorLog } = setup();
    stored(tx, paidCardOrder());
    refundsCreate.mockRejectedValue(new Error('Stripe is down'));

    const result = await service.cancel('o1', { by: 'customer', userId: 'u1' });

    expect(result.outcome).toBe('failed');
    expect(tx.order.updateMany).toHaveBeenCalledTimes(1); // the order was cancelled before the refund
    // No refund id is written: a failed attempt must not erase the id of an earlier refund
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { refundStatus: 'failed' },
    });
    expect(errorLog).toHaveBeenCalled(); // the admin can find it in the log
  });

  it('records a failure, and does not call Stripe, when a paid order has no payment id', async () => {
    const { service, tx, prisma, refundsCreate, errorLog } = setup();
    stored(tx, paidCardOrder({ paymentIntentId: null }));

    const result = await service.cancel('o1', { by: 'admin' });

    expect(result.outcome).toBe('failed');
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { refundStatus: 'failed' },
    });
    expect(errorLog).toHaveBeenCalled();
  });
});

describe('cancelOutOfStock', () => {
  it('cancels a paid order whose item sold out and refunds it', async () => {
    const { service, tx, refundsCreate } = setup();
    tx.order.findUnique.mockResolvedValue(makeOrder({ paymentMethod: 'card' }));
    tx.order.findUniqueOrThrow.mockResolvedValue(
      paidCardOrder({ status: 'Cancelled', paymentIntentId: 'pi_9' }),
    );
    refundsCreate.mockResolvedValue({ id: 're_9', status: 'succeeded' });

    const result = await service.cancelOutOfStock('o1', 'pi_9');

    // isPaid: false in the condition: a duplicate event finds nothing to do
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', isPaid: false },
      data: {
        isPaid: true,
        paymentIntentId: 'pi_9',
        status: 'Cancelled',
        deliveryOtp: '',
        statusHistory: [
          {
            status: 'Cancelled',
            note: 'Cancelled automatically: an item sold out before the payment arrived',
            timestamp: expect.any(String),
          },
        ],
      },
    });
    expect(tx.product.updateMany).not.toHaveBeenCalled(); // the stock was never taken for this order
    expect(refundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_9',
        reason: 'requested_by_customer',
        metadata: { orderId: 'o1' },
      },
      { idempotencyKey: 'refund-o1' },
    );
    expect(result?.outcome).toBe('refunded');
  });

  it('does nothing when the order does not exist', async () => {
    const { service, tx, refundsCreate } = setup();
    tx.order.findUnique.mockResolvedValue(null);

    const result = await service.cancelOutOfStock('o1', 'pi_9');

    expect(result).toBeUndefined();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('does nothing (and refunds nothing) when the same event arrives twice', async () => {
    const { service, tx, refundsCreate } = setup();
    tx.order.findUnique.mockResolvedValue(makeOrder({ paymentMethod: 'card' }));
    tx.order.updateMany.mockResolvedValue({ count: 0 }); // the first event already marked it paid

    const result = await service.cancelOutOfStock('o1', 'pi_9');

    expect(result).toBeUndefined();
    expect(tx.order.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});

describe('retryRefund', () => {
  it('refunds a cancelled order whose refund failed, with the SAME idempotency key', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.order.findUnique.mockResolvedValue(
      paidCardOrder({ status: 'Cancelled', refundStatus: 'failed' }),
    );
    refundsCreate.mockResolvedValue({ id: 're_2', status: 'succeeded' });

    const result = await service.retryRefund('o1');

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1' }),
      { idempotencyKey: 'refund-o1' },
    );
    expect(result.outcome).toBe('refunded');
  });

  it('does not refund an order that is already refunded', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.order.findUnique.mockResolvedValue(
      paidCardOrder({
        status: 'Cancelled',
        refundStatus: 'refunded',
        refundId: 're_0',
      }),
    );

    const result = await service.retryRefund('o1');

    expect(result.outcome).toBe('refunded');
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('has nothing to refund for a cash order', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.order.findUnique.mockResolvedValue(
      makeOrder({ status: 'Cancelled' }),
    );

    const result = await service.retryRefund('o1');

    expect(result.outcome).toBe('none');
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('refuses an order that is not cancelled', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.order.findUnique.mockResolvedValue(
      paidCardOrder({ status: 'Placed' }),
    );

    const error = await failureOf(service.retryRefund('o1'));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only cancelled orders can be refunded',
    );
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('answers "not found" for an order that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.order.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.retryRefund('o1'));

    expect(error).toBeInstanceOf(NotFoundException);
  });
});
