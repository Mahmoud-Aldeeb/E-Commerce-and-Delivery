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
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { ReturnsService } from '../../src/returns/returns.service.js';
import { line, makeOrder, makeProduct, makeUser } from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The service imports these only so Nest can inject them: the tests hand it the real client and a fake Stripe
vi.mock('../../src/prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../../src/stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
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
afterEach(() => {
  vi.restoreAllMocks();
});

const DAY = 86_400_000;

// Only the database is real. Stripe is a fake
function makeService() {
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const refundsList = vi.fn().mockResolvedValue({ data: [] });
  const stripe = {
    client: { refunds: { create: refundsCreate, list: refundsList } },
  };
  return {
    service: new ReturnsService(db.prisma as never, stripe as never),
    refundsCreate,
    refundsList,
  };
}

// A delivered card order of 3 shirts at $3.33: subtotal 9.99, delivery 1.99, tax 0.80, total 12.78.
// What can come back is 10.79 (the delivery stays). 10 shirts were on the shelf: 7 are left
async function seed(
  orderOverrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
) {
  await makeUser(db.prisma, 'u1');
  await makeUser(db.prisma, 'u2');
  await makeProduct(db.prisma, 'p1', { stock: 7 });
  await makeOrder(db.prisma, 'u1', 'o1', {
    status: 'Delivered',
    deliveredAt: new Date(Date.now() - 2 * DAY),
    paymentMethod: 'card',
    isPaid: true,
    paymentIntentId: 'pi_1',
    items: [line('p1', 3, 3.33, 'Shirt')],
    subtotal: 9.99,
    discount: 0,
    deliveryFee: 1.99,
    tax: 0.8,
    total: 12.78,
    ...orderOverrides,
  });
}

const unit = [{ product: 'p1', quantity: 1 }];
const ask = (service: ReturnsService, items = unit, userId = 'u1') =>
  service.createReturn(userId, 'o1', { items, reason: 'DEFECTIVE' } as never);

const stockOf = async () =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id: 'p1' },
      select: { stock: true },
    })
  ).stock;
const rowOf = (id: string) =>
  db.prisma.returnRequest.findUniqueOrThrow({ where: { id } });

const rejectedOf = (results: PromiseSettledResult<unknown>[]) =>
  results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

describe('asking for a return on a real database', () => {
  it('two requests for the last unit at the same moment: one is accepted, the other is told it is already being returned', async () => {
    await seed({
      items: [line('p1', 1, 3.33, 'Shirt')],
      subtotal: 3.33,
      tax: 0.27,
      total: 5.59,
    });
    const { service } = makeService();

    const results = await Promise.allSettled([ask(service), ask(service)]);

    const rejected = rejectedOf(results);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BadRequestException);
    expect(await db.prisma.returnRequest.count()).toBe(1);
  });

  it('ten requests of one unit for an order of three: exactly three are accepted, and they give back exactly what can come back', async () => {
    await seed();
    const { service } = makeService();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => ask(service)),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    for (const result of rejectedOf(results)) {
      expect(result.reason).toBeInstanceOf(BadRequestException);
    }

    const rows = await db.prisma.returnRequest.findMany({
      select: { refundAmount: true },
    });
    const amounts = rows.map((row) => row.refundAmount).sort((a, b) => a - b);
    // Two returns get a third of 10.79 and the one that takes the last unit gets what is left
    expect(amounts).toEqual([3.59, 3.6, 3.6]);
  });

  it('does not find the order of another customer', async () => {
    await seed();
    const { service } = makeService();

    const error = await ask(service, unit, 'u2').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(await db.prisma.returnRequest.count()).toBe(0);
  });

  it('refuses an order delivered more than 14 days ago', async () => {
    await seed({ deliveredAt: new Date(Date.now() - 20 * DAY) });
    const { service } = makeService();

    const error = await ask(service).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(await db.prisma.returnRequest.count()).toBe(0);
  });

  it('refuses an order that is not delivered', async () => {
    await seed({ status: 'Out for Delivery', deliveredAt: null });
    const { service } = makeService();

    const error = await ask(service).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('a rejected or a cancelled return gives its units back to the order', async () => {
    await seed({
      items: [line('p1', 1, 3.33, 'Shirt')],
      subtotal: 3.33,
      tax: 0.27,
      total: 5.59,
    });
    const { service } = makeService();

    const first = await ask(service);
    expect(
      await ask(service).catch((caught: unknown) => caught),
    ).toBeInstanceOf(BadRequestException);

    await service.reject(first.returnRequest.id, {
      note: 'The photo shows no damage',
    } as never);
    const second = await ask(service);
    await service.cancelMyReturn('u1', second.returnRequest.id);

    // Both are closed: the unit is free again
    await expect(ask(service)).resolves.toBeDefined();
  });
});

describe('completing a return on a real database', () => {
  it('two admins complete the same return at the same moment: the shelves grow ONCE and Stripe is asked ONCE', async () => {
    await seed();
    const { service, refundsCreate } = makeService();
    const { returnRequest } = await ask(service, [
      { product: 'p1', quantity: 2 },
    ]);
    await service.approve(returnRequest.id, {} as never);

    const results = await Promise.allSettled([
      service.complete(returnRequest.id, { restock: true } as never),
      service.complete(returnRequest.id, { restock: true } as never),
    ]);

    const rejected = rejectedOf(results);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The one that was late is told the return changed (or is already completed)
    expect(
      rejected[0].reason instanceof ConflictException ||
        rejected[0].reason instanceof BadRequestException,
    ).toBe(true);

    expect(await stockOf()).toBe(9);
    // 2 of 3 shirts: 6.66 / 9.99 of the 10.79 that can come back = $7.19
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 719 }),
      { idempotencyKey: `return-refund-${returnRequest.id}` },
    );
    expect(await rowOf(returnRequest.id)).toMatchObject({
      status: 'COMPLETED',
      restocked: true,
      refundStatus: 'refunded',
      refundId: 're_1',
    });
  });

  it('leaves the shelves alone when the items cannot be sold again, and still refunds', async () => {
    await seed();
    const { service, refundsCreate } = makeService();
    const { returnRequest } = await ask(service);
    await service.approve(returnRequest.id, {} as never);

    await service.complete(returnRequest.id, { restock: false } as never);

    expect(await stockOf()).toBe(7);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(await rowOf(returnRequest.id)).toMatchObject({
      restocked: false,
      status: 'COMPLETED',
    });
  });

  it('a cash return needs the confirmation, and never calls Stripe', async () => {
    await seed({ paymentMethod: 'cash', paymentIntentId: null, isPaid: false });
    const { service, refundsCreate } = makeService();
    const { returnRequest } = await ask(service);
    await service.approve(returnRequest.id, {} as never);

    const refused = await service
      .complete(returnRequest.id, { restock: true } as never)
      .catch((caught: unknown) => caught);
    expect(refused).toBeInstanceOf(BadRequestException);
    expect((await rowOf(returnRequest.id)).status).toBe('APPROVED');
    expect(await stockOf()).toBe(7);

    await service.complete(returnRequest.id, {
      restock: true,
      cashRefunded: true,
    } as never);

    expect(await rowOf(returnRequest.id)).toMatchObject({
      status: 'COMPLETED',
      refundStatus: 'refunded',
      refundId: null,
    });
    expect(await stockOf()).toBe(8);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('records a failed refund without failing the completion, and a retry completes it', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await seed();
    const { service, refundsCreate, refundsList } = makeService();
    refundsCreate
      .mockRejectedValueOnce(new Error('Stripe is down'))
      .mockResolvedValueOnce({ id: 're_2', status: 'succeeded' });
    const { returnRequest } = await ask(service);
    await service.approve(returnRequest.id, {} as never);

    await service.complete(returnRequest.id, { restock: true } as never);

    expect(await rowOf(returnRequest.id)).toMatchObject({
      status: 'COMPLETED',
      refundStatus: 'failed',
      refundId: null,
    });
    expect(await stockOf()).toBe(8);

    await service.retryRefund(returnRequest.id);

    expect(refundsList).toHaveBeenCalledWith({
      payment_intent: 'pi_1',
      limit: 100,
    });
    expect(await rowOf(returnRequest.id)).toMatchObject({
      refundStatus: 'refunded',
      refundId: 're_2',
    });
    // The same idempotency key both times
    expect(refundsCreate.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: `return-refund-${returnRequest.id}` },
      { idempotencyKey: `return-refund-${returnRequest.id}` },
    ]);
  });

  it('puts an option back with its product: the variant and the total of the product grow together', async () => {
    await makeUser(db.prisma, 'u1');
    await makeProduct(db.prisma, 'p1', { stock: 8 });
    await db.prisma.productVariant.createMany({
      data: [
        { id: 'v1', productId: 'p1', size: 'M', color: 'Black', stock: 5 },
        { id: 'v2', productId: 'p1', size: 'L', color: 'Black', stock: 3 },
      ],
    });
    // 2 shirts (M / Black) at $10: subtotal 20, delivery 1.99, tax 1.60, total 23.59. 21.60 can come back
    await makeOrder(db.prisma, 'u1', 'o1', {
      status: 'Delivered',
      deliveredAt: new Date(Date.now() - DAY),
      paymentMethod: 'card',
      isPaid: true,
      paymentIntentId: 'pi_1',
      items: [
        {
          ...line('p1', 2, 10, 'Shirt'),
          variant: 'v1',
          variantLabel: 'M / Black',
        },
      ],
      subtotal: 20,
      discount: 0,
      deliveryFee: 1.99,
      tax: 1.6,
      total: 23.59,
    });
    const { service, refundsCreate } = makeService();

    const { returnRequest } = await ask(service, [
      { product: 'p1', variant: 'v1', quantity: 2 },
    ] as never);
    await service.approve(returnRequest.id, {} as never);
    await service.complete(returnRequest.id, { restock: true } as never);

    const variants = await db.prisma.productVariant.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, stock: true },
    });
    expect(variants).toEqual([
      { id: 'v1', stock: 7 },
      { id: 'v2', stock: 3 },
    ]);
    expect(await stockOf()).toBe(10);
    // The whole order came back: everything that can come back, the delivery stays
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2160 }),
      expect.anything(),
    );
  });
});

describe('the admin lists on a real database', () => {
  it('counts every tab, finds a return by its number, and lists the failed refunds', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await seed();
    const { service, refundsCreate } = makeService();

    const requested = await ask(service);
    const approved = await ask(service);
    const completed = await ask(service);
    await service.approve(approved.returnRequest.id, {} as never);
    await service.approve(completed.returnRequest.id, {} as never);
    refundsCreate.mockRejectedValueOnce(new Error('Stripe is down'));
    await service.complete(completed.returnRequest.id, {
      restock: false,
    } as never);

    const all = await service.getAdminReturns({} as never);
    expect(all.counts).toEqual({
      all: 3,
      requested: 1,
      approved: 1,
      completed: 1,
      declined: 0,
      'refund-failed': 1,
    });
    expect(all.total).toBe(3);

    const failed = await service.getAdminReturns({
      tab: 'refund-failed',
    } as never);
    expect(failed.returnRequests.map((row) => row.id)).toEqual([
      completed.returnRequest.id,
    ]);
    expect(failed.returnRequests[0]).toMatchObject({
      order: { id: 'o1', paymentMethod: 'card' },
      user: { name: 'User u1', email: 'u1@example.com' },
    });

    const found = await service.getAdminReturns({
      search: requested.returnRequest.id.slice(0, 8).toUpperCase(),
    } as never);
    expect(found.returnRequests.map((row) => row.id)).toEqual([
      requested.returnRequest.id,
    ]);
  });
});
