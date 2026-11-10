import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { StripeWebhookService } from './stripe-webhook.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
}));
vi.mock('./stripe.service.js', () => ({
  StripeService: class StripeService {},
}));
vi.mock('../orders/order-cancellation.service.js', () => ({
  OrderCancellationService: class OrderCancellationService {},
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const paymentSucceeded = {
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1' } },
} as never;

// A card order of 2 items; the wallet pays $5.00 of it
const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  userId: 'u1',
  items: [{ product: 'a', quantity: 2 }],
  walletAmountUsed: 5,
  ...overrides,
});

function setup() {
  const tx = {
    order: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(order()),
    },
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ walletBalanceCents: 0 }),
    },
    walletTransaction: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
    order: { deleteMany: vi.fn() },
  };
  const stripe = {
    client: {
      webhooks: { constructEvent: vi.fn() },
      checkout: {
        sessions: {
          list: vi
            .fn()
            .mockResolvedValue({ data: [{ metadata: { orderId: 'o1' } }] }),
        },
      },
    },
  };
  const inngest = { sendSafely: vi.fn() };
  const cancellation = { cancelOutOfStock: vi.fn() };

  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  const service = new StripeWebhookService(
    stripe as never,
    prisma as never,
    inngest as never,
    { get: vi.fn().mockReturnValue('whsec_test') } as never,
    cancellation as never,
  );
  return { service, tx, inngest, cancellation };
}

describe('payment_intent.succeeded with the store wallet', () => {
  it('takes the wallet money together with the stock, the stock first', async () => {
    const { service, tx, inngest } = setup();

    await service.handleEvent(paymentSucceeded);

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', walletBalanceCents: { gte: 500 } },
      data: { walletBalanceCents: { decrement: 500 } },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'ORDER_PAYMENT',
        amountCents: -500,
        balanceAfterCents: 0,
        reference: 'order:o1',
        orderId: 'o1',
        returnId: null,
      },
    });
    expect(tx.product.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.updateMany.mock.invocationCallOrder[0],
    );
    expect(inngest.sendSafely).toHaveBeenCalledTimes(1);
  });

  it('does not touch the wallet of an order that used none', async () => {
    const { service, tx } = setup();
    tx.order.findUniqueOrThrow.mockResolvedValue(
      order({ walletAmountUsed: 0 }),
    );

    await service.handleEvent(paymentSucceeded);

    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('cancels and refunds, with its own reason, when the wallet cannot pay any more', async () => {
    const { service, tx, inngest, cancellation } = setup();
    tx.user.updateMany.mockResolvedValue({ count: 0 }); // the customer spent it somewhere else

    await service.handleEvent(paymentSucceeded); // and does not fail

    expect(cancellation.cancelOutOfStock).toHaveBeenCalledWith(
      'o1',
      'pi_1',
      expect.stringContaining('wallet'),
    );
    expect(inngest.sendSafely).not.toHaveBeenCalled();
  });

  it('keeps the old answer for an item that sold out: two arguments, and the wallet is never asked', async () => {
    const { service, tx, cancellation } = setup();
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    await service.handleEvent(paymentSucceeded);

    expect(cancellation.cancelOutOfStock).toHaveBeenCalledWith('o1', 'pi_1');
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});
