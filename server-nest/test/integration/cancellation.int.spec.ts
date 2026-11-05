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
import { OrderCancellationService } from '../../src/orders/order-cancellation.service.js';
import { CUSTOMER_CANCELLABLE_STATUSES } from '../../src/orders/order-rules.js';
import { line, makeOrder, makeProduct, makeUser } from './factories.js';
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

let db: TestDatabase;

beforeAll(() => {
  db = createTestPrisma();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDatabase(db.prisma);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function makeService() {
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const stripe = { client: { refunds: { create: refundsCreate } } };
  return {
    service: new OrderCancellationService(db.prisma as never, stripe as never),
    refundsCreate,
  };
}

// An order of 2 units of "p1": 18 are left on the shelf, 20 were there before the order
async function seed(orderOverrides: Record<string, unknown> = {}) {
  await makeUser(db.prisma, 'u1');
  await makeProduct(db.prisma, 'p1', { stock: 18 });
  await makeOrder(db.prisma, 'u1', 'o1', {
    items: [line('p1', 2, 10)],
    deliveryOtp: '123456',
    ...orderOverrides,
  });
}

const PAID_CARD = {
  paymentMethod: 'card',
  isPaid: true,
  paymentIntentId: 'pi_1',
};

const stockOf = async () =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id: 'p1' },
      select: { stock: true },
    })
  ).stock;
const orderRow = () =>
  db.prisma.order.findUniqueOrThrow({ where: { id: 'o1' } });

describe('cancel on a real database', () => {
  it('cancels a cash order, puts its items back on the shelf and writes who cancelled', async () => {
    await seed();
    const { service, refundsCreate } = makeService();

    const result = await service.cancel('o1', { by: 'admin' });

    expect(result.outcome).toBe('none');
    expect(refundsCreate).not.toHaveBeenCalled();
    expect(await stockOf()).toBe(20);
    const saved = await orderRow();
    expect(saved).toMatchObject({ status: 'Cancelled', deliveryOtp: '' });
    expect(saved.statusHistory).toEqual([
      expect.objectContaining({
        status: 'Cancelled',
        note: 'Cancelled by the store',
      }),
    ]);
  });

  it('puts back the products that still exist when another product of the order is gone', async () => {
    await seed({ items: [line('p1', 2, 10), line('ghost', 1, 10)] });
    const { service } = makeService();

    await service.cancel('o1', { by: 'admin' });

    expect(await stockOf()).toBe(20);
    expect((await orderRow()).status).toBe('Cancelled');
  });

  it('puts the stock back ONCE and refunds ONCE when two people cancel the same paid order at the same moment', async () => {
    await seed(PAID_CARD);
    const { service, refundsCreate } = makeService();

    const results = await Promise.allSettled([
      service.cancel('o1', { by: 'admin' }),
      service.cancel('o1', {
        by: 'customer',
        userId: 'u1',
        allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES,
      }),
    ]);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The one that was late is told the order changed (or is already finished)
    expect(
      rejected[0].reason instanceof ConflictException ||
        rejected[0].reason instanceof BadRequestException,
    ).toBe(true);

    expect(await stockOf()).toBe(20);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(await orderRow()).toMatchObject({
      status: 'Cancelled',
      refundStatus: 'refunded',
      refundId: 're_1',
    });
  });

  it('records a failed refund without failing the cancellation, and a retry completes it', async () => {
    await seed(PAID_CARD);
    const { service, refundsCreate } = makeService();
    refundsCreate
      .mockRejectedValueOnce(new Error('Stripe is down'))
      .mockResolvedValueOnce({ id: 're_2', status: 'succeeded' });

    const cancelled = await service.cancel('o1', { by: 'admin' });

    expect(cancelled.outcome).toBe('failed');
    expect(await orderRow()).toMatchObject({
      status: 'Cancelled',
      refundStatus: 'failed',
      refundId: null,
    });
    expect(await stockOf()).toBe(20);

    const retried = await service.retryRefund('o1');

    expect(retried.outcome).toBe('refunded');
    expect(await orderRow()).toMatchObject({
      refundStatus: 'refunded',
      refundId: 're_2',
    });
    // The same idempotency key both times: Stripe can never refund twice
    expect(refundsCreate.mock.calls.map((call) => call[1])).toEqual([
      { idempotencyKey: 'refund-o1' },
      { idempotencyKey: 'refund-o1' },
    ]);
  });

  it('does not refund an order that is already refunded', async () => {
    await seed({
      ...PAID_CARD,
      status: 'Cancelled',
      refundStatus: 'refunded',
      refundId: 're_0',
    });
    const { service, refundsCreate } = makeService();

    const result = await service.retryRefund('o1');

    expect(result.outcome).toBe('refunded');
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it("does not find another customer's order, and does not touch the stock", async () => {
    await seed();
    await makeUser(db.prisma, 'u2');
    const { service } = makeService();

    const error = await service
      .cancel('o1', {
        by: 'customer',
        userId: 'u2',
        allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(await stockOf()).toBe(18);
    expect((await orderRow()).status).toBe('Placed');
  });

  it('refuses a customer once the order is packed, and changes nothing', async () => {
    await seed({ status: 'Packed' });
    const { service } = makeService();

    const error = await service
      .cancel('o1', {
        by: 'customer',
        userId: 'u1',
        allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(await stockOf()).toBe(18);
    expect((await orderRow()).status).toBe('Packed');
  });
});
