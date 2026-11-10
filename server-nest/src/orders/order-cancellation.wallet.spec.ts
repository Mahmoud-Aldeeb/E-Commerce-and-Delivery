import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, Logger } from '@nestjs/common';
import { OrderCancellationService } from './order-cancellation.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));

afterEach(() => {
  vi.restoreAllMocks();
});

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// A cash order of 2 items; the wallet paid $5.00 of it
const orderRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  userId: 'u1',
  status: 'Placed',
  paymentMethod: 'cash',
  isPaid: false,
  paymentIntentId: null,
  refundStatus: null,
  refundId: null,
  deliveryOtp: '123456',
  statusHistory: [],
  items: [{ product: 'p1', quantity: 2 }],
  walletAmountUsed: 5,
  ...overrides,
});

function setup(order = orderRow(), cancelled: Record<string, unknown> = {}) {
  const tx = {
    order: {
      findFirst: vi.fn().mockResolvedValue(order),
      findUnique: vi.fn().mockResolvedValue(order),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ ...order, status: 'Cancelled', ...cancelled }),
    },
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: { update: vi.fn().mockResolvedValue({ walletBalanceCents: 1500 }) },
    walletTransaction: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
    order: { update: vi.fn().mockResolvedValue({}) },
  };
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const stripe = { client: { refunds: { create: refundsCreate } } };

  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  return {
    service: new OrderCancellationService(prisma as never, stripe as never),
    tx,
    prisma,
    refundsCreate,
  };
}

describe('cancel: the store wallet', () => {
  it('gives back to the wallet what it paid, and writes the ledger entry', async () => {
    const { service, tx } = setup();

    await service.cancel('o1', { by: 'admin' });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { walletBalanceCents: { increment: 500 } },
      select: { walletBalanceCents: true },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'ORDER_REFUND',
        amountCents: 500,
        balanceAfterCents: 1500,
        reference: 'order-refund:o1',
        orderId: 'o1',
        returnId: null,
      },
    });
  });

  it('puts the items back BEFORE it credits the wallet (the lock order of the whole app)', async () => {
    const { service, tx } = setup();

    await service.cancel('o1', { by: 'customer', userId: 'u1' });

    expect(tx.product.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.update.mock.invocationCallOrder[0],
    );
  });

  it('a card order paid partly by the wallet: Stripe gives back the whole charge (the card part), the wallet gets its part', async () => {
    const { service, tx, refundsCreate } = setup(
      orderRow({
        paymentMethod: 'card',
        isPaid: true,
        paymentIntentId: 'pi_1',
      }),
    );

    const result = await service.cancel('o1', { by: 'admin' });

    // No `amount`: the charge was only the card part, and that is what comes back
    expect(refundsCreate).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        reason: 'requested_by_customer',
        metadata: { orderId: 'o1' },
      },
      { idempotencyKey: 'refund-o1' },
    );
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { walletBalanceCents: { increment: 500 } },
      }),
    );
    expect(result.outcome).toBe('refunded');
  });

  it('an order the wallet paid in full gives all of it back to the wallet, and Stripe is not asked', async () => {
    const { service, tx, refundsCreate } = setup(
      orderRow({
        paymentMethod: 'wallet',
        isPaid: true,
        walletAmountUsed: 23.59,
      }),
    );

    const result = await service.cancel('o1', { by: 'admin' });

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { walletBalanceCents: { increment: 2359 } },
      }),
    );
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(result.outcome).toBe('none');
  });

  it('does not touch the wallet of an order that used none', async () => {
    const { service, tx } = setup(orderRow({ walletAmountUsed: 0 }));

    await service.cancel('o1', { by: 'admin' });

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('credits nothing when the order changed at the same moment', async () => {
    const { service, tx } = setup();
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const error = await failureOf(service.cancel('o1', { by: 'admin' }));

    expect(error).toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('cancelOutOfStock: the store wallet', () => {
  // A card order that was never charged to the wallet: the webhook rolled its transaction back
  const unpaidCard = () =>
    orderRow({
      paymentMethod: 'card',
      isPaid: false,
      paymentIntentId: null,
      walletAmountUsed: 5,
    });
  const paidCard = { isPaid: true, paymentIntentId: 'pi_1' };

  it('credits nothing, because the wallet was never debited, and writes the default reason', async () => {
    const { service, tx, refundsCreate } = setup(unpaidCard(), paidCard);

    await service.cancelOutOfStock('o1', 'pi_1');

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', isPaid: false },
      data: expect.objectContaining({
        isPaid: true,
        status: 'Cancelled',
        statusHistory: expect.arrayContaining([
          expect.objectContaining({
            status: 'Cancelled',
            note: 'Cancelled automatically: an item sold out before the payment arrived',
          }),
        ]),
      }),
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('writes the reason it is given', async () => {
    const { service, tx } = setup(unpaidCard(), paidCard);

    await service.cancelOutOfStock('o1', 'pi_1', 'The wallet was empty');

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          statusHistory: expect.arrayContaining([
            expect.objectContaining({ note: 'The wallet was empty' }),
          ]),
        }),
      }),
    );
  });
});
