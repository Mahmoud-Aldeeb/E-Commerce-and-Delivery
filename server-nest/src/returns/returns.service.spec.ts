import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ReturnsService } from './returns.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

const NOW = new Date('2026-11-08T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks(); // puts the real Logger methods back
});

// One shirt, as a return stores it
const shirt = {
  product: 'a',
  variant: null,
  variantLabel: null,
  name: 'Shirt',
  image: 'a.png',
  price: 20,
  quantity: 1,
};

// 2 shirts of $20: subtotal 40, no delivery fee, tax 3.20, total 43.20. 3 days after the delivery
const deliveredOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  status: 'Delivered',
  deliveredAt: new Date('2026-11-05T10:00:00.000Z'),
  items: [
    { product: 'a', name: 'Shirt', image: 'a.png', price: 20, quantity: 2 },
  ],
  subtotal: 40,
  total: 43.2,
  deliveryFee: 0,
  ...overrides,
});

const returnRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  orderId: 'o1',
  status: 'REQUESTED',
  statusHistory: [],
  items: [shirt],
  refundAmount: 21.6,
  refundStatus: null,
  adminNote: null,
  order: { paymentMethod: 'card', paymentIntentId: 'pi_1' },
  ...overrides,
});

const request = (quantity = 1) =>
  ({ items: [{ product: 'a', quantity }], reason: 'DEFECTIVE' }) as never;

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'o1' }]),
    order: { findUniqueOrThrow: vi.fn().mockResolvedValue(deliveredOrder()) },
    returnRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: 'r1',
        ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    order: { findFirst: vi.fn() },
    returnRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'r1' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ id: 'r1' }),
    },
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
  };
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const refundsList = vi.fn().mockResolvedValue({ data: [] });
  const stripe = {
    client: { refunds: { create: refundsCreate, list: refundsList } },
  };

  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  const service = new ReturnsService(prisma as never, stripe as never);
  return { service, tx, prisma, refundsCreate, refundsList };
}

describe('createReturn', () => {
  it('saves the return with what the customer chose, the refund, and the first line of its history', async () => {
    const { service, tx } = setup();

    const result = await service.createReturn('u1', 'o1', {
      items: [{ product: 'a', quantity: 1 }],
      reason: 'DEFECTIVE',
      comment: '  Torn seam ',
    } as never);

    expect(tx.returnRequest.create).toHaveBeenCalledWith({
      data: {
        orderId: 'o1',
        userId: 'u1',
        items: [shirt],
        reason: 'DEFECTIVE',
        comment: 'Torn seam',
        refundAmount: 21.6, // half of the 43.20 that can come back
        statusHistory: [
          {
            status: 'Requested',
            note: 'Return requested: Defective or damaged',
            timestamp: NOW.toISOString(),
          },
        ],
      },
      // The customer never sees the Stripe id of a refund
      omit: { refundId: true },
    });
    expect(result.returnRequest).toMatchObject({
      id: 'r1',
      refundAmount: 21.6,
    });
  });

  it('locks the order of THIS customer: the owner is part of the lock query', async () => {
    const { service, tx } = setup();

    await service.createReturn('u1', 'o1', request());

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    // The values of the tagged template: the order id, then the owner
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toEqual(['o1', 'u1']);
  });

  it('answers "not found" when the order is not the customer’s, and saves nothing', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValue([]);

    const error = await failureOf(service.createReturn('u2', 'o1', request()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toHaveProperty('message', 'Order not found');
    expect(tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it('refuses an order that is not delivered', async () => {
    const { service, tx } = setup();
    tx.order.findUniqueOrThrow.mockResolvedValue(
      deliveredOrder({ status: 'Packed' }),
    );

    const error = await failureOf(service.createReturn('u1', 'o1', request()));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only a delivered order can be returned',
    );
    expect(tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it('refuses an order delivered more than 14 days ago', async () => {
    const { service, tx } = setup();
    tx.order.findUniqueOrThrow.mockResolvedValue(
      deliveredOrder({ deliveredAt: new Date('2026-10-19T10:00:00.000Z') }),
    );

    const error = await failureOf(service.createReturn('u1', 'o1', request()));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'The 14 days to return this order have passed',
    );
    expect(tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it('refuses more than what was ordered', async () => {
    const { service, tx } = setup();

    const error = await failureOf(service.createReturn('u1', 'o1', request(3)));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only 2 of "Shirt" can still be returned',
    );
    expect(tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it('gives the return that takes the last unit exactly what is left of the money', async () => {
    const { service, tx } = setup();
    // An earlier return holds one shirt and $20 (on purpose not the exact half: 21.60)
    tx.returnRequest.findMany.mockResolvedValue([
      { items: [shirt], refundAmount: 20 },
    ]);

    await service.createReturn('u1', 'o1', request(1));

    // 43.20 can come back, 20 is held: the last shirt gets 23.20
    expect(tx.returnRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundAmount: 23.2 }),
      }),
    );
  });

  it('counts the units that earlier returns hold', async () => {
    const { service, tx } = setup();
    tx.returnRequest.findMany.mockResolvedValue([
      { items: [shirt], refundAmount: 21.6 },
    ]);

    const error = await failureOf(service.createReturn('u1', 'o1', request(2)));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only 1 of "Shirt" can still be returned',
    );
  });

  it('only counts the returns that are still active (not rejected, not cancelled)', async () => {
    const { service, tx } = setup();

    await service.createReturn('u1', 'o1', request());

    expect(tx.returnRequest.findMany).toHaveBeenCalledWith({
      where: {
        orderId: 'o1',
        status: { in: ['REQUESTED', 'APPROVED', 'COMPLETED'] },
      },
      select: { items: true, refundAmount: true },
    });
  });
});

describe('cancelMyReturn', () => {
  it('cancels a return that is waiting for the store, and writes who cancelled', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findFirst.mockResolvedValue(returnRow());

    await service.cancelMyReturn('u1', 'r1');

    expect(prisma.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'REQUESTED' },
      data: expect.objectContaining({
        status: 'CANCELLED',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({
            status: 'Cancelled',
            note: 'Cancelled by the customer',
          }),
        ]),
      }),
    });
  });

  it('looks the return up by its owner, so another customer’s return is not found', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findFirst.mockResolvedValue(null);

    const error = await failureOf(service.cancelMyReturn('u2', 'r1'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.returnRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'r1', userId: 'u2' },
    });
    expect(prisma.returnRequest.updateMany).not.toHaveBeenCalled();
  });

  it('answers "not found" for a return that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findFirst.mockResolvedValue(null);

    const error = await failureOf(service.cancelMyReturn('u1', 'nope'));

    expect(error).toHaveProperty('message', 'Return not found');
  });

  it('refuses once the store has answered, and changes nothing', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findFirst.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );

    const error = await failureOf(service.cancelMyReturn('u1', 'r1'));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.returnRequest.updateMany).not.toHaveBeenCalled();
  });

  it('tells the customer when the return changed at the same moment', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findFirst.mockResolvedValue(returnRow());
    prisma.returnRequest.updateMany.mockResolvedValue({ count: 0 });

    const error = await failureOf(service.cancelMyReturn('u1', 'r1'));

    expect(error).toBeInstanceOf(ConflictException);
  });
});

describe('approve', () => {
  it('moves a new request to approved, with the note for the customer', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(returnRow());

    await service.approve('r1', { note: ' Send it to our office ' } as never);

    expect(prisma.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'REQUESTED' },
      data: expect.objectContaining({
        status: 'APPROVED',
        adminNote: 'Send it to our office',
      }),
    });
  });

  it('refuses a request that is not new', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );

    const error = await failureOf(service.approve('r1', {} as never));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only a new request can be approved',
    );
    expect(prisma.returnRequest.updateMany).not.toHaveBeenCalled();
  });

  it('answers "not found" for a return that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.approve('nope', {} as never));

    expect(error).toBeInstanceOf(NotFoundException);
  });
});

describe('reject', () => {
  it('needs a reason: the customer reads it', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(returnRow());

    const error = await failureOf(
      service.reject('r1', { note: '   ' } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'Say why the return is refused');
    expect(prisma.returnRequest.updateMany).not.toHaveBeenCalled();
  });

  it('can refuse an approved return too (the items did not come back right)', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );

    await service.reject('r1', { note: 'The box was empty' } as never);

    expect(prisma.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'APPROVED' },
      data: expect.objectContaining({
        status: 'REJECTED',
        adminNote: 'The box was empty',
      }),
    });
  });

  it('refuses to refuse a return that is already completed', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'COMPLETED' }),
    );

    const error = await failureOf(
      service.reject('r1', { note: 'No' } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.returnRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe('complete', () => {
  it('answers "not found" for a return that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.complete('nope', { restock: true } as never),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('only completes an approved return', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'REQUESTED' }),
    );

    const error = await failureOf(
      service.complete('r1', { restock: true } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only an approved return can be completed',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('puts the items back, then refunds the card for exactly the return, once', async () => {
    const { service, tx, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );

    await service.complete('r1', { restock: true } as never);

    // The status is part of the condition: a double click finds nothing to do
    expect(tx.returnRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', status: 'APPROVED' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        restocked: true,
        refundStatus: null,
        completedAt: NOW,
      }),
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { stock: { increment: 1 } },
    });
    expect(refundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        amount: 2160, // $21.60 in cents
        reason: 'requested_by_customer',
        metadata: { returnId: 'r1', orderId: 'o1' },
      },
      { idempotencyKey: 'return-refund-r1' },
    );
    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'refunded', refundId: 're_1' },
    });
    // The money part comes AFTER the database has committed
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      refundsCreate.mock.invocationCallOrder[0],
    );
  });

  it('leaves the shelves alone when the admin says the items cannot be sold again', async () => {
    const { service, tx, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );

    await service.complete('r1', { restock: false } as never);

    expect(tx.returnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          restocked: false,
        }),
      }),
    );
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('does nothing else when the return changed at the same moment (no stock, no refund)', async () => {
    const { service, tx, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );
    tx.returnRequest.updateMany.mockResolvedValue({ count: 0 });

    const error = await failureOf(
      service.complete('r1', { restock: true } as never),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('needs the admin to confirm a cash refund, because nobody can give cash back from here', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({
        status: 'APPROVED',
        order: { paymentMethod: 'cash', paymentIntentId: null },
      }),
    );

    const error = await failureOf(
      service.complete('r1', { restock: true } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Confirm that you have given the money back by hand',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('completes a cash return as refunded, and never calls Stripe', async () => {
    const { service, tx, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({
        status: 'APPROVED',
        order: { paymentMethod: 'cash', paymentIntentId: null },
      }),
    );

    await service.complete('r1', {
      restock: false,
      cashRefunded: true,
    } as never);

    expect(tx.returnRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          refundStatus: 'refunded',
        }),
      }),
    );
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(prisma.returnRequest.update).not.toHaveBeenCalled();
  });

  it('records a failed card refund without failing the completion', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );
    refundsCreate.mockRejectedValue(new Error('Stripe is down'));

    await expect(
      service.complete('r1', { restock: true } as never),
    ).resolves.toBeDefined();

    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'failed' },
    });
  });

  it('records a failed refund when the order has no payment id, and does not call Stripe', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({
        status: 'APPROVED',
        order: { paymentMethod: 'card', paymentIntentId: null },
      }),
    );

    await service.complete('r1', { restock: true } as never);

    expect(refundsCreate).not.toHaveBeenCalled();
    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'failed' },
    });
  });

  it('records a refund that Stripe says is pending, with its id', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );
    refundsCreate.mockResolvedValue({ id: 're_2', status: 'pending' });

    await service.complete('r1', { restock: true } as never);

    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'pending', refundId: 're_2' },
    });
  });

  it('has nothing to refund when the amount is zero', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED', refundAmount: 0 }),
    );

    await service.complete('r1', { restock: true } as never);

    expect(refundsCreate).not.toHaveBeenCalled();
    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'none' },
    });
  });
});

describe('retryRefund', () => {
  const completed = (overrides: Record<string, unknown> = {}) =>
    returnRow({ status: 'COMPLETED', refundStatus: 'failed', ...overrides });

  it('looks for an earlier refund of this return, then refunds with the same key', async () => {
    const { service, prisma, refundsCreate, refundsList } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(completed());

    await service.retryRefund('r1');

    expect(refundsList).toHaveBeenCalledWith({
      payment_intent: 'pi_1',
      limit: 100,
    });
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 2160 }),
      { idempotencyKey: 'return-refund-r1' },
    );
    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'refunded', refundId: 're_1' },
    });
  });

  it('does not refund again when Stripe already has a refund of this return', async () => {
    const { service, prisma, refundsCreate, refundsList } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(completed());
    refundsList.mockResolvedValue({
      data: [
        { id: 're_old', status: 'succeeded', metadata: { returnId: 'r1' } },
      ],
    });

    await service.retryRefund('r1');

    expect(refundsCreate).not.toHaveBeenCalled();
    expect(prisma.returnRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { refundStatus: 'refunded', refundId: 're_old' },
    });
  });

  it('ignores the refunds of OTHER returns of the same payment', async () => {
    const { service, prisma, refundsCreate, refundsList } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(completed());
    refundsList.mockResolvedValue({
      data: [
        { id: 're_other', status: 'succeeded', metadata: { returnId: 'r2' } },
      ],
    });

    await service.retryRefund('r1');

    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('also retries a return whose refund was never recorded', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      completed({ refundStatus: null }),
    );

    await service.retryRefund('r1');

    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it.each(['refunded', 'pending'])(
    'refuses a refund that is %s',
    async (refundStatus) => {
      const { service, prisma, refundsCreate } = setup();
      prisma.returnRequest.findUnique.mockResolvedValue(
        completed({ refundStatus }),
      );

      const error = await failureOf(service.retryRefund('r1'));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toHaveProperty(
        'message',
        'This refund does not need another try',
      );
      expect(refundsCreate).not.toHaveBeenCalled();
    },
  );

  it('only refunds a completed return', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      returnRow({ status: 'APPROVED' }),
    );

    const error = await failureOf(service.retryRefund('r1'));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Only a completed return can be refunded',
    );
  });

  it('has nothing to retry for a cash return', async () => {
    const { service, prisma, refundsCreate } = setup();
    prisma.returnRequest.findUnique.mockResolvedValue(
      completed({ order: { paymentMethod: 'cash', paymentIntentId: null } }),
    );

    const error = await failureOf(service.retryRefund('r1'));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});

describe('the lists', () => {
  it('lists the returns of a tab, finds by the number, and counts every tab', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.count.mockResolvedValue(3);

    const result = await service.getAdminReturns({
      tab: 'requested',
      search: '#R-ab12',
      limit: 10,
      page: 2,
    } as never);

    expect(prisma.returnRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { status: 'REQUESTED' },
            {
              OR: [
                { id: { contains: 'ab12', mode: 'insensitive' } },
                { orderId: { contains: 'ab12', mode: 'insensitive' } },
                { user: { name: { contains: 'ab12', mode: 'insensitive' } } },
                { user: { email: { contains: 'ab12', mode: 'insensitive' } } },
              ],
            },
          ],
        },
        take: 10,
        skip: 10,
      }),
    );
    // The counts of the tabs ignore the search text
    expect(result.counts).toEqual({
      all: 3,
      requested: 3,
      approved: 3,
      completed: 3,
      declined: 3,
      'refund-failed': 3,
    });
  });

  it('lists the failed refunds: failed, or never recorded for a card return', async () => {
    const { service, prisma } = setup();

    await service.getAdminReturns({ tab: 'refund-failed' } as never);

    expect(prisma.returnRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              status: 'COMPLETED',
              OR: [
                { refundStatus: 'failed' },
                { refundStatus: null, order: { paymentMethod: 'card' } },
              ],
            },
            {},
          ],
        },
      }),
    );
  });

  it('lists my returns, newest first, without the Stripe id', async () => {
    const { service, prisma } = setup();

    await service.getMyReturns('u1', { limit: 5, page: 2 } as never);

    expect(prisma.returnRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        omit: { refundId: true },
        take: 5,
        skip: 5,
      }),
    );
  });

  it('says whether an order can be returned and what is left, counting only active returns', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(deliveredOrder());
    prisma.returnRequest.findMany.mockResolvedValue([
      { id: 'r1', status: 'APPROVED', items: [shirt] },
      { id: 'r2', status: 'REJECTED', items: [shirt] }, // holds nothing
    ]);

    const result = await service.getOrderReturns('u1', 'o1');

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1', userId: 'u1' } }),
    );
    expect(result.eligibility).toEqual({
      eligible: true,
      windowEndsAt: new Date('2026-11-19T10:00:00.000Z'),
    });
    expect(result.windowDays).toBe(14);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({
      ordered: 2,
      returned: 1,
      available: 1,
    });
    expect(result.returnRequests).toHaveLength(2);
  });

  it('answers "not found" for the order of another customer', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(null);

    const error = await failureOf(service.getOrderReturns('u2', 'o1'));

    expect(error).toBeInstanceOf(NotFoundException);
  });
});
