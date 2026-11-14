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
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { OrderCancellationService } from '../../src/orders/order-cancellation.service.js';
import { OrdersService } from '../../src/orders/orders.service.js';
import { ReturnsService } from '../../src/returns/returns.service.js';
import {
  ADDRESS,
  line,
  makeOrder,
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
});
afterEach(() => {
  vi.restoreAllMocks();
});

const DAY = 86_400_000;

// Only the database is real. Stripe and the background jobs are fakes
function makeServices() {
  const refundsCreate = vi
    .fn()
    .mockResolvedValue({ id: 're_1', status: 'succeeded' });
  const stripe = {
    client: {
      refunds: {
        create: refundsCreate,
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      checkout: { sessions: { create: vi.fn() } },
    },
  };
  const inngest = { send: vi.fn().mockResolvedValue(undefined) };
  const cancellation = new OrderCancellationService(
    db.prisma as never,
    stripe as never,
  );
  return {
    returns: new ReturnsService(db.prisma as never, stripe as never),
    orders: new OrdersService(
      db.prisma as never,
      stripe as never,
      inngest as never,
      cancellation,
      { resolve: vi.fn() } as never,
    ),
    refundsCreate,
  };
}

// A delivered CASH order of 3 shirts at $3.33: subtotal 9.99, delivery 1.99, tax 0.80, total 12.78.
// What can come back is 10.79 (the delivery stays). 10 shirts were on the shelf: 7 are left
async function seed(order: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
  await makeUser(db.prisma, 'u1');
  await makeProduct(db.prisma, 'p1', { price: 3.33, stock: 7 });
  await makeOrder(db.prisma, 'u1', 'o1', {
    status: 'Delivered',
    deliveredAt: new Date(Date.now() - 2 * DAY),
    paymentMethod: 'cash',
    isPaid: false,
    items: [line('p1', 3, 3.33, 'Shirt')],
    subtotal: 9.99,
    discount: 0,
    deliveryFee: 1.99,
    tax: 0.8,
    total: 12.78,
    ...order,
  });
}

const ask = (
  returns: ReturnsService,
  quantity: number,
  extra: Record<string, unknown> = {},
) =>
  returns.createReturn('u1', 'o1', {
    items: [{ product: 'p1', quantity }],
    reason: 'DEFECTIVE',
    ...extra,
  } as never);

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
const rowOf = (id: string) =>
  db.prisma.returnRequest.findUniqueOrThrow({ where: { id } });

describe('returns refunded to the wallet on a real database', () => {
  it('a cash return goes to the wallet by default: the balance, the ledger and the shelves change together', async () => {
    await seed();
    const { returns, refundsCreate } = makeServices();
    // 2 of 3 shirts: 6.66 / 9.99 of the 10.79 that can come back = $7.19
    const { returnRequest } = await ask(returns, 2);
    await returns.approve(returnRequest.id, {} as never);

    await returns.complete(returnRequest.id, { restock: true } as never);

    expect(await rowOf(returnRequest.id)).toMatchObject({
      refundMethod: 'STORE_WALLET',
      refundAmount: 7.19,
      walletRefundAmount: 7.19,
      status: 'COMPLETED',
      refundStatus: 'refunded',
    });
    expect(await balanceOf()).toBe(719);
    expect(await stockOf()).toBe(9);
    const rows = await db.prisma.walletTransaction.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'RETURN_REFUND',
      amountCents: 719,
      balanceAfterCents: 719,
      reference: `return:${returnRequest.id}`,
      returnId: returnRequest.id,
    });
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('two admins complete the same wallet return at the same moment: the wallet is credited ONCE', async () => {
    await seed();
    const { returns } = makeServices();
    const { returnRequest } = await ask(returns, 2);
    await returns.approve(returnRequest.id, {} as never);

    const results = await Promise.allSettled([
      returns.complete(returnRequest.id, { restock: true } as never),
      returns.complete(returnRequest.id, { restock: true } as never),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await balanceOf()).toBe(719);
    expect(await stockOf()).toBe(9);
    expect(await db.prisma.walletTransaction.count()).toBe(1);
  });

  it('a mobile wallet return keeps the number clean, waits for the store, and the wallet is not touched', async () => {
    await seed();
    const { returns, refundsCreate } = makeServices();
    const { returnRequest } = await ask(returns, 1, {
      refundMethod: 'MOBILE_WALLET',
      refundDestinationDetails: '+20 101 234 5678',
    });
    await returns.approve(returnRequest.id, {} as never);

    await returns.complete(returnRequest.id, { restock: true } as never);

    expect(await rowOf(returnRequest.id)).toMatchObject({
      refundMethod: 'MOBILE_WALLET',
      refundDestinationDetails: '01012345678',
      walletRefundAmount: 0,
      refundStatus: 'manual-pending',
    });
    expect(await balanceOf()).toBe(0);
    expect(await db.prisma.walletTransaction.count()).toBe(0);
    expect(refundsCreate).not.toHaveBeenCalled();

    await returns.markRefundPaid(returnRequest.id);

    expect((await rowOf(returnRequest.id)).refundStatus).toBe('refunded');
    const again = await returns
      .markRefundPaid(returnRequest.id)
      .catch((caught: unknown) => caught);
    expect(again).toBeInstanceOf(BadRequestException);
  });

  it('a card order the wallet paid in part: the wallet part goes to the wallet, only the rest to Stripe', async () => {
    // The wallet paid $5.00 of the $12.78 and the card paid $7.78
    await seed({
      paymentMethod: 'card',
      isPaid: true,
      paymentIntentId: 'pi_1',
      walletAmountUsed: 5,
      finalAmountPaid: 7.78,
    });
    const { returns, refundsCreate } = makeServices();
    // All 3 shirts: everything that can come back (10.79)
    const { returnRequest } = await ask(returns, 3);
    await returns.approve(returnRequest.id, {} as never);

    await returns.complete(returnRequest.id, { restock: true } as never);

    expect(await rowOf(returnRequest.id)).toMatchObject({
      refundMethod: 'ORIGINAL_PAYMENT',
      refundAmount: 10.79,
      walletRefundAmount: 5,
      refundStatus: 'refunded',
    });
    expect(await balanceOf()).toBe(500);
    // 10.79 - 5.00 = $5.79 to the card, never more than the card paid (7.78)
    expect(refundsCreate).toHaveBeenCalledTimes(1);
    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 579 }),
      { idempotencyKey: `return-refund-${returnRequest.id}` },
    );
  });

  it('the money of a return can be spent at once: the next order is paid from the wallet', async () => {
    await seed();
    const { returns, orders } = makeServices();
    const { returnRequest } = await ask(returns, 2);
    await returns.approve(returnRequest.id, {} as never);
    await returns.complete(returnRequest.id, { restock: true } as never);
    expect(await balanceOf()).toBe(719);

    // One shirt: 3.33 + 1.99 delivery + 0.27 tax = $5.59, and the wallet holds $7.19
    await orders.createOrder('u1', {
      items: [{ product: 'p1', quantity: 1 }],
      shippingAddress: ADDRESS,
      paymentMethod: 'cash',
      useWallet: true,
    } as never);

    const saved = await db.prisma.order.findFirstOrThrow({
      where: { paymentMethod: 'wallet' },
    });
    expect(saved).toMatchObject({
      total: 5.59,
      walletAmountUsed: 5.59,
      isPaid: true,
    });
    expect(await balanceOf()).toBe(160);
    const rows = await db.prisma.walletTransaction.findMany({
      orderBy: { amountCents: 'asc' },
    });
    expect(rows.map((row) => [row.type, row.amountCents])).toEqual([
      ['ORDER_PAYMENT', -559],
      ['RETURN_REFUND', 719],
    ]);
  });
});
