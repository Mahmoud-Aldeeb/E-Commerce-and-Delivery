import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ConflictException, Logger } from '@nestjs/common';
import { CashService } from '../../src/cash/cash.service.js';
import { OrderCancellationService } from '../../src/orders/order-cancellation.service.js';
import { OrdersService } from '../../src/orders/orders.service.js';
import { StripeWebhookService } from '../../src/stripe/stripe-webhook.service.js';
import {
  ADDRESS,
  makeOrder,
  makePartner,
  makeProduct,
  makeUser,
} from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The services import these only so Nest can inject them: the tests hand them fakes instead
vi.mock('../../src/prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../../src/stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));
vi.mock('../../src/inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
}));
vi.mock('../../src/coupons/coupons.service.js', () => ({
  CouponsService: class CouponsService {},
}));

let db: TestDatabase;

beforeAll(() => {
  db = createTestPrisma();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDatabase(db.prisma);
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Only the database is real. Stripe, the background jobs and the coupons are fakes
function makeServices() {
  const sessionsCreate = vi
    .fn()
    .mockResolvedValue({ url: 'https://stripe.test/pay' });
  const sessionsList = vi.fn().mockResolvedValue({ data: [] });
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const stripe = {
    client: {
      checkout: { sessions: { create: sessionsCreate, list: sessionsList } },
      refunds: { create: refundsCreate },
    },
  };
  const inngest = {
    send: vi.fn().mockResolvedValue(undefined),
    sendSafely: vi.fn().mockResolvedValue(undefined),
  };
  const cancellation = new OrderCancellationService(
    db.prisma as never,
    stripe as never,
  );
  const orders = new OrdersService(
    db.prisma as never,
    stripe as never,
    inngest as never,
    cancellation,
    { resolve: vi.fn() } as never,
  );
  const webhook = new StripeWebhookService(
    stripe as never,
    db.prisma as never,
    inngest as never,
    { get: vi.fn().mockReturnValue('whsec_test') } as never,
    cancellation,
  );
  return {
    orders,
    webhook,
    sessionsCreate,
    sessionsList,
    refundsCreate,
    inngest,
  };
}

// 2 units of "p1" at $10: 20 + 1.99 delivery + 1.60 tax = $23.59
const dto = (overrides: Record<string, unknown> = {}) =>
  ({
    items: [{ product: 'p1', quantity: 2 }],
    shippingAddress: ADDRESS,
    paymentMethod: 'cash',
    useWallet: true,
    ...overrides,
  }) as never;

const balanceOf = async () =>
  (
    await db.prisma.user.findUniqueOrThrow({
      where: { id: 'u1' },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;
const stockOf = async () =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id: 'p1' },
      select: { stock: true },
    })
  ).stock;

async function seed(balanceCents: number) {
  await makeUser(db.prisma, 'u1', { walletBalanceCents: balanceCents });
  await makeProduct(db.prisma, 'p1', { price: 10, stock: 20 });
}

const paymentSucceeded = {
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1' } },
} as never;

describe('orders with the store wallet on a real database', () => {
  it('two orders spend the same wallet at the same moment: one gets it, the other is told it changed, and nothing of the second is left behind', async () => {
    await seed(1000); // $10.00: each order wants all of it
    const { orders } = makeServices();

    const results = await Promise.allSettled([
      orders.createOrder('u1', dto()),
      orders.createOrder('u1', dto()),
    ]);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect((rejected[0].reason as Error).message).toBe(
      'Your wallet balance changed. Please check it and try again',
    );

    expect(await balanceOf()).toBe(0);
    expect(await db.prisma.order.count()).toBe(1);
    expect(await stockOf()).toBe(18); // the stock of the second order was rolled back with it
    expect(await db.prisma.walletTransaction.count()).toBe(1);
  });

  it('an order the wallet pays in full is saved as a paid wallet order, and only its total is taken', async () => {
    await seed(5000);
    const { orders, inngest, sessionsCreate } = makeServices();

    await orders.createOrder('u1', dto({ paymentMethod: 'card' }));

    const saved = await db.prisma.order.findFirstOrThrow();
    expect(saved).toMatchObject({
      paymentMethod: 'wallet',
      isPaid: true,
      total: 23.59,
      walletAmountUsed: 23.59,
      finalAmountPaid: 0,
    });
    expect(await balanceOf()).toBe(2641); // 50.00 - 23.59
    expect(await stockOf()).toBe(18);
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it('cancelling a cash order that used the wallet gives the money and the stock back, and the ledger shows both movements', async () => {
    await seed(1000);
    const { orders } = makeServices();
    const created = (await orders.createOrder('u1', dto())) as {
      order: { id: string };
    };
    expect(await balanceOf()).toBe(0);
    expect(await stockOf()).toBe(18);

    await orders.cancelMyOrder('u1', created.order.id, {} as never);

    expect(await balanceOf()).toBe(1000);
    expect(await stockOf()).toBe(20);
    const rows = await db.prisma.walletTransaction.findMany({
      orderBy: { amountCents: 'asc' },
    });
    expect(rows.map((row) => [row.type, row.amountCents])).toEqual([
      ['ORDER_PAYMENT', -1000],
      ['ORDER_REFUND', 1000],
    ]);
  });

  it('a card order takes its wallet money and its stock ONCE, when the payment arrives, even if Stripe tells it six times at the same moment', async () => {
    await seed(500);
    const { orders, webhook, sessionsList } = makeServices();

    await orders.createOrder(
      'u1',
      dto({ paymentMethod: 'card' }),
      'https://shop.example',
    );

    const saved = await db.prisma.order.findFirstOrThrow();
    expect(saved).toMatchObject({
      paymentMethod: 'card',
      isPaid: false,
      walletAmountUsed: 5,
      finalAmountPaid: 18.59,
    });
    // Nothing is held while the customer is on the page of Stripe
    expect(await balanceOf()).toBe(500);
    expect(await stockOf()).toBe(20);

    sessionsList.mockResolvedValue({
      data: [{ metadata: { orderId: saved.id } }],
    });
    await Promise.all(
      Array.from({ length: 6 }, () => webhook.handleEvent(paymentSucceeded)),
    );

    expect(await balanceOf()).toBe(0);
    expect(await stockOf()).toBe(18);
    expect(
      (await db.prisma.order.findUniqueOrThrow({ where: { id: saved.id } }))
        .isPaid,
    ).toBe(true);
    expect(await db.prisma.walletTransaction.count()).toBe(1);
  });

  it('a card order whose wallet was spent meanwhile is cancelled and refunded when the payment arrives, and the stock and the wallet are left alone', async () => {
    await seed(500);
    const { orders, webhook, sessionsList, refundsCreate } = makeServices();
    await orders.createOrder(
      'u1',
      dto({ paymentMethod: 'card' }),
      'https://shop.example',
    );
    const saved = await db.prisma.order.findFirstOrThrow();
    sessionsList.mockResolvedValue({
      data: [{ metadata: { orderId: saved.id } }],
    });
    await db.prisma.user.update({
      where: { id: 'u1' },
      data: { walletBalanceCents: 0 },
    });

    await webhook.handleEvent(paymentSucceeded);

    expect(
      await db.prisma.order.findUniqueOrThrow({ where: { id: saved.id } }),
    ).toMatchObject({
      status: 'Cancelled',
      isPaid: true,
      refundStatus: 'refunded',
    });
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(await stockOf()).toBe(20);
    expect(await balanceOf()).toBe(0);
    expect(await db.prisma.walletTransaction.count()).toBe(0);
  });

  it('the courier owes only what he collected: the wallet part is not cash, and an order the wallet paid in full is not cash', async () => {
    await makeUser(db.prisma, 'u1');
    await makePartner(db.prisma, 'd1');
    const delivered = {
      status: 'Delivered',
      deliveryPartnerId: 'd1',
      deliveredAt: new Date('2026-11-02T10:00:00.000Z'),
    };
    // Cash with $5.00 from the wallet: the courier took $18.59
    await makeOrder(db.prisma, 'u1', 'o1', {
      ...delivered,
      paymentMethod: 'cash',
      total: 23.59,
      walletAmountUsed: 5,
      finalAmountPaid: 18.59,
    });
    // Paid by the wallet in full: no cash at all
    await makeOrder(db.prisma, 'u1', 'o2', {
      ...delivered,
      paymentMethod: 'wallet',
      isPaid: true,
      total: 10,
      walletAmountUsed: 10,
      finalAmountPaid: 0,
    });

    const result = await new CashService(db.prisma as never).getOverview();

    expect(result.partners[0]).toMatchObject({
      id: 'd1',
      cashOrders: 1,
      collected: 18.59,
      owed: 18.59,
    });
  });
});
