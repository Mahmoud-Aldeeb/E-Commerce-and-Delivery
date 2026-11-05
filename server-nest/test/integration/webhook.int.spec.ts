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
import { Logger } from '@nestjs/common';
import { OrderCancellationService } from '../../src/orders/order-cancellation.service.js';
import { StripeWebhookService } from '../../src/stripe/stripe-webhook.service.js';
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
vi.mock('../../src/inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
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
  // The services write to the log: keep the output of the tests clean
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// The unpaid card order of 2 units of "p1", and the stock of that product
async function seed(stock: number) {
  await makeUser(db.prisma, 'u1');
  await makeProduct(db.prisma, 'p1', { stock });
  await makeOrder(db.prisma, 'u1', 'o1', {
    paymentMethod: 'card',
    isPaid: false,
    items: [line('p1', 2, 10)],
    total: 23.59,
  });
}

// Only the database is real. Stripe, the background jobs and the config are fakes
function makeService() {
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const stripe = {
    client: {
      // The order id was stored in the Checkout Session when the order was created
      checkout: {
        sessions: {
          list: vi
            .fn()
            .mockResolvedValue({ data: [{ metadata: { orderId: 'o1' } }] }),
        },
      },
      refunds: { create: refundsCreate },
    },
  };
  const inngest = { sendSafely: vi.fn().mockResolvedValue(undefined) };
  const cancellation = new OrderCancellationService(
    db.prisma as never,
    stripe as never,
  );
  const service = new StripeWebhookService(
    stripe as never,
    db.prisma as never,
    inngest as never,
    { get: vi.fn().mockReturnValue('whsec_test') } as never,
    cancellation,
  );
  return { service, refundsCreate, inngest };
}

const paymentSucceeded = {
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1' } },
} as never;

const stockOf = async () =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id: 'p1' },
      select: { stock: true },
    })
  ).stock;
const orderRow = () =>
  db.prisma.order.findUniqueOrThrow({ where: { id: 'o1' } });

describe('payment_intent.succeeded on a real database', () => {
  it('takes the stock ONCE when Stripe sends the same event six times at the same moment', async () => {
    await seed(10);
    const { service, inngest } = makeService();

    await Promise.all(
      Array.from({ length: 6 }, () => service.handleEvent(paymentSucceeded)),
    );

    expect(await stockOf()).toBe(8);
    expect(await orderRow()).toMatchObject({
      isPaid: true,
      paymentIntentId: 'pi_1',
      status: 'Placed',
    });
    expect(inngest.sendSafely).toHaveBeenCalledTimes(1);
  });

  it('cancels and refunds when the item sold out after the payment, and leaves the stock alone', async () => {
    await seed(1); // 2 units were ordered, 1 is left
    const { service, refundsCreate, inngest } = makeService();

    await service.handleEvent(paymentSucceeded);

    expect(await orderRow()).toMatchObject({
      status: 'Cancelled',
      isPaid: true,
      paymentIntentId: 'pi_1',
      refundStatus: 'refunded',
      refundId: 're_1',
      deliveryOtp: '',
    });
    expect(await stockOf()).toBe(1);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1' }),
      { idempotencyKey: 'refund-o1' },
    );
    expect(inngest.sendSafely).not.toHaveBeenCalled();
  });

  it('refunds ONCE when the same sold-out event arrives six times at the same moment', async () => {
    await seed(1);
    const { service, refundsCreate } = makeService();

    await Promise.all(
      Array.from({ length: 6 }, () => service.handleEvent(paymentSucceeded)),
    );

    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(await orderRow()).toMatchObject({
      status: 'Cancelled',
      refundStatus: 'refunded',
    });
    expect(await stockOf()).toBe(1);
  });

  it('does nothing when the event of an order that was already cancelled and refunded arrives again', async () => {
    await seed(1);
    const { service, refundsCreate } = makeService();
    await service.handleEvent(paymentSucceeded);

    await service.handleEvent(paymentSucceeded);

    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(await orderRow()).toMatchObject({
      status: 'Cancelled',
      refundId: 're_1',
    });
  });
});
