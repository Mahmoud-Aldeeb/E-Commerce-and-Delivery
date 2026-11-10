import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));
vi.mock('../inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
}));
vi.mock('./order-cancellation.service.js', () => ({
  OrderCancellationService: class OrderCancellationService {},
}));
vi.mock('../coupons/coupons.service.js', () => ({
  CouponsService: class CouponsService {},
}));

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

const watch = {
  id: 'p1',
  name: 'Watch',
  image: 'watch.png',
  price: 10,
  stock: 20,
  variants: [],
};

const address = {
  label: 'Home',
  address: '12 Nile St',
  city: 'Cairo',
  state: 'Cairo',
  zip: '11511',
  lat: 30,
  lng: 31,
};

// 2 watches: 20 + 1.99 delivery + 1.60 tax = $23.59
const makeDto = (overrides: Record<string, unknown> = {}) =>
  ({
    items: [{ product: 'p1', quantity: 2 }],
    shippingAddress: address,
    paymentMethod: 'cash',
    ...overrides,
  }) as never;

function setup(balanceCents = 1000) {
  const tx = {
    order: {
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: 'o1',
        ...data,
      })),
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
    user: {
      findUnique: vi.fn().mockResolvedValue({
        phone: '+20 101 234 5678',
        walletBalanceCents: balanceCents,
      }),
    },
    product: { findMany: vi.fn().mockResolvedValue([watch]) },
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
  };
  const sessionsCreate = vi
    .fn()
    .mockResolvedValue({ url: 'https://stripe.test/pay' });
  const stripe = {
    client: { checkout: { sessions: { create: sessionsCreate } } },
  };
  const inngest = { send: vi.fn().mockResolvedValue(undefined) };

  const service = new OrdersService(
    prisma as never,
    stripe as never,
    inngest as never,
    {} as never,
    { resolve: vi.fn() } as never,
  );
  return { service, tx, prisma, sessionsCreate, inngest };
}

describe('createOrder with the store wallet', () => {
  it.each([[undefined], [false]])(
    'does not touch the wallet when the customer does not ask for it (useWallet: %j)',
    async (useWallet) => {
      const { service, tx } = setup(5000);

      await service.createOrder('u1', makeDto({ useWallet }));

      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.walletTransaction.create).not.toHaveBeenCalled();
      expect(tx.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentMethod: 'cash',
          walletAmountUsed: 0,
          finalAmountPaid: 23.59,
          isPaid: false,
        }),
      });
    },
  );

  it('a cash order: the wallet pays what it can, the rest is paid in cash, and the wallet is debited after the stock', async () => {
    const { service, tx } = setup(500); // $5.00 in the wallet

    await service.createOrder('u1', makeDto({ useWallet: true }));

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'cash',
        total: 23.59,
        walletAmountUsed: 5,
        finalAmountPaid: 18.59,
        isPaid: false,
      }),
    });
    // The balance is part of the condition of the SAME statement that subtracts
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
    // The lock order of the whole app: the stock first, the wallet after
    expect(tx.product.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.updateMany.mock.invocationCallOrder[0],
    );
  });

  it('a wallet that covers the whole order makes it a paid wallet order, whatever method the client sent', async () => {
    const { service, tx, sessionsCreate, inngest } = setup(5000);

    const result = await service.createOrder(
      'u1',
      makeDto({ paymentMethod: 'card', useWallet: true }),
      'https://shop.example',
    );

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'wallet',
        walletAmountUsed: 23.59,
        finalAmountPaid: 0,
        isPaid: true,
      }),
    });
    // Only what the order costs is taken, not the whole balance
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', walletBalanceCents: { gte: 2359 } },
      data: { walletBalanceCents: { decrement: 2359 } },
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      order: expect.objectContaining({ id: 'o1', paymentMethod: 'wallet' }),
    });
  });

  it('a wallet that equals the total covers the order exactly', async () => {
    const { service, tx } = setup(2359);

    await service.createOrder('u1', makeDto({ useWallet: true }));

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'wallet',
        walletAmountUsed: 23.59,
        finalAmountPaid: 0,
      }),
    });
  });

  it('a card order: Stripe is asked for the rest only, and neither the wallet nor the stock is touched until the payment', async () => {
    const { service, tx, sessionsCreate, inngest } = setup(500);

    const result = await service.createOrder(
      'u1',
      makeDto({ paymentMethod: 'card', useWallet: true }),
      'https://shop.example',
    );

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Order payment' },
              unit_amount: 1859, // 23.59 - 5.00, in cents
            },
            quantity: 1,
          },
        ],
      }),
    );
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'card',
        walletAmountUsed: 5,
        finalAmountPaid: 18.59,
        isPaid: false,
      }),
    });
    // The webhook takes both when Stripe confirms the payment: an abandoned checkout holds nothing
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'https://stripe.test/pay' });
  });

  it('refuses to use an empty wallet, and saves nothing', async () => {
    const { service, prisma } = setup(0);

    const error = await failureOf(
      service.createOrder('u1', makeDto({ useWallet: true })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'Your wallet is empty');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['without asking to use the wallet', 5000, false],
    ['when the wallet cannot cover the order', 500, true],
  ])(
    'refuses "wallet" as the payment method %s',
    async (_name, balance, useWallet) => {
      const { service, prisma } = setup(balance);

      const error = await failureOf(
        service.createOrder(
          'u1',
          makeDto({ paymentMethod: 'wallet', useWallet }),
        ),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toHaveProperty(
        'message',
        'Your wallet does not cover this order: choose how to pay the rest',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses a card part under 50 cents, which a card payment cannot take', async () => {
    const { service, prisma, sessionsCreate } = setup(2350); // 9 cents are left to pay

    const error = await failureOf(
      service.createOrder(
        'u1',
        makeDto({ paymentMethod: 'card', useWallet: true }),
      ),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'A card payment cannot be under $0.50. Pay the rest in cash, or do not use the wallet',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('lets a cash order keep a small rest', async () => {
    const { service, tx } = setup(2350);

    await service.createOrder('u1', makeDto({ useWallet: true }));

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'cash',
        walletAmountUsed: 23.5,
        finalAmountPaid: 0.09,
      }),
    });
  });

  it('tells the customer when the wallet changed at the same moment, and no order is returned', async () => {
    const { service, tx } = setup(500);
    tx.user.updateMany.mockResolvedValue({ count: 0 }); // somebody spent it first

    const error = await failureOf(
      service.createOrder('u1', makeDto({ useWallet: true })),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'Your wallet balance changed. Please check it and try again',
    );
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('takes the stock first: an item that sold out never touches the wallet', async () => {
    const { service, tx } = setup(500);
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    const error = await failureOf(
      service.createOrder('u1', makeDto({ useWallet: true })),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty('message', '"Watch" was just sold out');
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });
});
