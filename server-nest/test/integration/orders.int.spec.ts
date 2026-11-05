import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ConflictException } from '@nestjs/common';
import { OrderCancellationService } from '../../src/orders/order-cancellation.service.js';
import { OrdersService } from '../../src/orders/orders.service.js';
import { ADDRESS, imageOf, makeProduct, makeUser } from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
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
});

// Only the database is real. Stripe, the background jobs and the coupons are fakes
function makeService() {
  const sessionsCreate = vi
    .fn()
    .mockResolvedValue({ url: 'https://stripe.test/pay' });
  const stripe = {
    client: {
      checkout: { sessions: { create: sessionsCreate } },
      refunds: {
        create: vi.fn().mockResolvedValue({ id: 're_1', status: 'succeeded' }),
      },
    },
  };
  const inngest = { send: vi.fn().mockResolvedValue(undefined) };
  const cancellation = new OrderCancellationService(
    db.prisma as never,
    stripe as never,
  );
  const service = new OrdersService(
    db.prisma as never,
    stripe as never,
    inngest as never,
    cancellation,
    { resolve: vi.fn() } as never,
  );
  return { service, sessionsCreate, inngest };
}

const order = (
  product: string,
  quantity: number,
  paymentMethod: 'cash' | 'card' = 'cash',
) =>
  ({
    items: [{ product, quantity }],
    shippingAddress: ADDRESS,
    paymentMethod,
  }) as never;

const stockOf = async (id: string) =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { stock: true },
    })
  ).stock;

describe('createOrder on a real database', () => {
  it('two customers order the last unit at the same moment: one gets it, the other is told it is gone, and only one order exists', async () => {
    await makeUser(db.prisma, 'u1');
    await makeUser(db.prisma, 'u2');
    await makeProduct(db.prisma, 'p1', { stock: 1 });
    const { service } = makeService();

    const results = await Promise.allSettled([
      service.createOrder('u1', order('p1', 1)),
      service.createOrder('u2', order('p1', 1)),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect((rejected[0].reason as Error).message).toMatch(
      /was just sold out|is out of stock/,
    );

    expect(await stockOf('p1')).toBe(0);
    // The order of the customer who lost was created and then rolled back: nothing is left behind
    expect(await db.prisma.order.count()).toBe(1);
  });

  it('ten customers order three units: exactly three orders exist and the stock is zero', async () => {
    for (let n = 1; n <= 10; n++) await makeUser(db.prisma, `u${n}`);
    await makeProduct(db.prisma, 'p1', { stock: 3 });
    const { service } = makeService();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        service.createOrder(`u${index + 1}`, order('p1', 1)),
      ),
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    for (const result of rejected)
      expect(result.reason).toBeInstanceOf(ConflictException);

    expect(await stockOf('p1')).toBe(0);
    expect(await db.prisma.order.count()).toBe(3);
  });

  it('saves a cash order with its totals, takes its stock and sends the events', async () => {
    await makeUser(db.prisma, 'u1');
    await makeProduct(db.prisma, 'p1', { price: 10, stock: 20 });
    const { service, inngest } = makeService();

    const result = (await service.createOrder('u1', order('p1', 2))) as {
      order: { id: string };
    };

    const saved = await db.prisma.order.findUniqueOrThrow({
      where: { id: result.order.id },
    });
    // 2 x 10 = 20: exactly 20 still pays delivery
    expect(saved).toMatchObject({
      userId: 'u1',
      paymentMethod: 'cash',
      status: 'Placed',
      subtotal: 20,
      discount: 0,
      deliveryFee: 1.99,
      tax: 1.6,
      total: 23.59,
      isPaid: false,
      couponId: null,
    });
    expect(saved.items).toEqual([
      {
        product: 'p1',
        name: 'Product p1',
        image: imageOf('p1'),
        price: 10,
        quantity: 2,
      },
    ]);
    expect(await stockOf('p1')).toBe(18);
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('saves a card order unpaid, sends the customer to Stripe, and leaves the stock alone until the payment', async () => {
    await makeUser(db.prisma, 'u1');
    await makeProduct(db.prisma, 'p1', { stock: 20 });
    const { service, sessionsCreate, inngest } = makeService();

    const result = await service.createOrder(
      'u1',
      order('p1', 2, 'card'),
      'https://shop.example',
    );

    expect(result).toEqual({ url: 'https://stripe.test/pay' });
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const saved = await db.prisma.order.findFirstOrThrow();
    expect(saved).toMatchObject({
      paymentMethod: 'card',
      isPaid: false,
      total: 23.59,
    });
    expect(await stockOf('p1')).toBe(20);
    expect(inngest.send).not.toHaveBeenCalled();
  });
});
