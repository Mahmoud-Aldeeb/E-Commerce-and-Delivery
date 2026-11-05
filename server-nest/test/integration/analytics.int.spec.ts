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
import { AnalyticsService } from '../../src/admin/analytics.service.js';
import { line, makeOrder, makeProduct, makeUser } from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The service imports it only so Nest can inject it: the tests hand it the real client instead
vi.mock('../../src/prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

// Thursday 12:00 in Cairo (December is winter time, UTC+2). Only the clock is frozen: the database
// driver keeps its real timers
const NOW = new Date('2026-12-10T10:00:00.000Z');

let db: TestDatabase;

beforeAll(() => {
  db = createTestPrisma();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDatabase(db.prisma);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const at = (iso: string) => new Date(iso);
const cancelledBy = (note: string) => [
  { status: 'Cancelled', note, timestamp: '2026-12-08T10:00:00.000Z' },
];

async function seed() {
  const prisma = db.prisma;
  await makeUser(prisma, 'u1');

  await makeProduct(prisma, 'p1', { name: 'Watch', stock: 4 });
  await makeProduct(prisma, 'p2', { name: 'Mat', stock: 50 });
  await makeProduct(prisma, 'p3', { name: 'Lamp', price: 8, stock: 0 });
  await makeProduct(prisma, 'p4', { name: 'Pen', stock: 2 });
  await makeProduct(prisma, 'p5', { name: 'Big', stock: 5000 });
  await makeProduct(prisma, 'p6', { name: 'Untracked', stock: null }); // no stock number: never "low"

  // The sales of the 7 days (Dec 4 to Dec 10)
  await makeOrder(prisma, 'u1', 's1', {
    status: 'Delivered',
    createdAt: at('2026-12-10T08:00:00.000Z'),
    total: 30,
    discount: 5,
    items: [line('p1', 2, 10, 'Watch'), line('p2', 1, 10, 'Mat')],
  });
  await makeOrder(prisma, 'u1', 's2', {
    paymentMethod: 'card',
    isPaid: true,
    createdAt: at('2026-12-09T22:30:00.000Z'), // 00:30 of Dec 10 in Cairo
    total: 12,
    items: [line('p1', 1, 10, 'Watch')],
  });
  await makeOrder(prisma, 'u1', 's3', {
    createdAt: at('2026-12-09T21:30:00.000Z'), // 23:30 of Dec 9 in Cairo
    total: 20,
    items: [line('p2', 2, 10, 'Mat')],
  });
  await makeOrder(prisma, 'u1', 's4', {
    status: 'Delivered',
    createdAt: at('2026-12-06T10:00:00.000Z'),
    total: 8,
    discount: 1,
    items: [line('p3', 1, 8, 'Lamp')],
  });
  // A card order that was never paid is not a sale
  await makeOrder(prisma, 'u1', 'x1', {
    paymentMethod: 'card',
    isPaid: false,
    createdAt: at('2026-12-10T09:00:00.000Z'),
    total: 99,
    items: [line('p5', 1, 99, 'Big')],
  });

  // The 7 days before: two sales, 65 dollars
  await makeOrder(prisma, 'u1', 'prev1', {
    createdAt: at('2026-11-30T10:00:00.000Z'),
    total: 50,
  });
  await makeOrder(prisma, 'u1', 'prev2', {
    createdAt: at('2026-12-01T10:00:00.000Z'),
    total: 15,
  });

  // Cancelled orders of the period: the Watch is in three of them
  await makeOrder(prisma, 'u1', 'c1', {
    status: 'Cancelled',
    createdAt: at('2026-12-08T10:00:00.000Z'),
    total: 12,
    items: [line('p1', 1, 10, 'Watch')],
    statusHistory: cancelledBy('Cancelled by the customer'),
  });
  await makeOrder(prisma, 'u1', 'c2', {
    status: 'Cancelled',
    createdAt: at('2026-12-08T11:00:00.000Z'),
    total: 18,
    items: [line('p1', 1, 10, 'Watch'), line('p3', 1, 8, 'Lamp')],
    statusHistory: cancelledBy(
      'Cancelled by the courier: Customer refused the order',
    ),
  });
  await makeOrder(prisma, 'u1', 'c3', {
    status: 'Cancelled',
    createdAt: at('2026-12-07T10:00:00.000Z'),
    total: 20,
    items: [line('p1', 2, 10, 'Watch')],
    statusHistory: cancelledBy('Cancelled by the store'),
  });
  // The system cancelled this one because an item sold out: it says nothing about the Mat
  await makeOrder(prisma, 'u1', 'c4', {
    paymentMethod: 'card',
    isPaid: true,
    paymentIntentId: 'pi_x',
    status: 'Cancelled',
    refundStatus: 'refunded',
    refundId: 're_x',
    createdAt: at('2026-12-07T11:00:00.000Z'),
    total: 50,
    items: [line('p2', 5, 10, 'Mat')],
    statusHistory: cancelledBy(
      'Cancelled automatically: an item sold out before the payment arrived',
    ),
  });

  // Refunds. These were placed in November: they are not in the 7 days, only in the refund list
  const cancelledCard = {
    paymentMethod: 'card',
    status: 'Cancelled',
    createdAt: at('2026-11-15T10:00:00.000Z'),
  };
  await makeOrder(prisma, 'u1', 'r1', {
    ...cancelledCard,
    isPaid: true,
    refundStatus: null, // cancelled, paid, and no refund was ever recorded
    paymentIntentId: null,
    total: 25.5,
    updatedAt: at('2026-11-20T10:00:00.000Z'),
  });
  await makeOrder(prisma, 'u1', 'r2', {
    ...cancelledCard,
    isPaid: true,
    refundStatus: 'failed',
    paymentIntentId: 'pi_2',
    total: 20,
    updatedAt: at('2026-11-21T10:00:00.000Z'),
  });
  await makeOrder(prisma, 'u1', 'r3', {
    ...cancelledCard,
    isPaid: true,
    refundStatus: 'pending',
    paymentIntentId: 'pi_3',
    total: 10,
    updatedAt: at('2026-11-22T10:00:00.000Z'), // pending for over a week
  });
  await makeOrder(prisma, 'u1', 'r4', {
    ...cancelledCard,
    isPaid: true,
    refundStatus: 'pending',
    paymentIntentId: 'pi_4',
    total: 10,
    updatedAt: at('2026-12-09T10:00:00.000Z'), // pending for a day: not a problem yet
  });
  // Cash was never paid online: nothing to refund. A card order that was never paid: the same
  await makeOrder(prisma, 'u1', 'r5', {
    status: 'Cancelled',
    createdAt: at('2026-11-15T10:00:00.000Z'),
    refundStatus: null,
  });
  await makeOrder(prisma, 'u1', 'r6', {
    ...cancelledCard,
    isPaid: false,
    refundStatus: null,
  });
}

describe('the analytics on a real database', () => {
  it('works out the sales, the days and the comparison from the orders of the database', async () => {
    await seed();
    const service = new AnalyticsService(db.prisma as never);

    const result = await service.getAnalytics({ days: 7 });

    expect(result.range).toEqual({
      from: '2026-12-04',
      to: '2026-12-10',
      days: 7,
      timeZone: 'Africa/Cairo',
    });
    expect(result.truncated).toBe(false);
    expect(result.summary).toEqual({
      orders: 4,
      revenue: 70,
      discount: 6,
      averageOrder: 17.5,
      bestDay: { date: '2026-12-10', revenue: 42 },
      cancelledOrders: 4,
      cancelRate: 50, // 4 cancelled of 8 placed
    });
    expect(result.previous).toEqual({ orders: 2, revenue: 65 });
    expect(result.change).toEqual({ orders: 100, revenue: 8 });
    expect(
      result.days.map((day) => [
        day.date,
        day.orders,
        day.revenue,
        day.discount,
      ]),
    ).toEqual([
      ['2026-12-04', 0, 0, 0],
      ['2026-12-05', 0, 0, 0],
      ['2026-12-06', 1, 8, 1],
      ['2026-12-07', 0, 0, 0],
      ['2026-12-08', 0, 0, 0],
      ['2026-12-09', 1, 20, 0], // 23:30 in Cairo
      ['2026-12-10', 2, 42, 5], // 08:00 and 00:30 in Cairo
    ]);
  });

  it('ranks the best sellers, with the stock of today', async () => {
    await seed();
    const service = new AnalyticsService(db.prisma as never);

    const result = await service.getAnalytics({ days: 7 });

    expect(result.bestSellers).toEqual([
      {
        productId: 'p1',
        name: 'Watch',
        image: 'https://placehold.co/p1.png',
        units: 3,
        revenue: 30,
        orders: 2,
        stock: 4,
      },
      {
        productId: 'p2',
        name: 'Mat',
        image: 'https://placehold.co/p2.png',
        units: 3,
        revenue: 30,
        orders: 2,
        stock: 50,
      },
      {
        productId: 'p3',
        name: 'Lamp',
        image: 'https://placehold.co/p3.png',
        units: 1,
        revenue: 8,
        orders: 1,
        stock: 0,
      },
    ]);
  });

  it('flags the product that is in many cancelled orders, and leaves out the order the system cancelled', async () => {
    await seed();
    const service = new AnalyticsService(db.prisma as never);

    const result = await service.getAnalytics({ days: 7 });

    // The Watch: 3 cancelled orders and 4 of its 7 ordered units. The Mat: only an order the system
    // cancelled, so it does not count. The Lamp: one cancelled order, so it is not listed
    expect(result.cancelledProducts).toEqual([
      {
        productId: 'p1',
        name: 'Watch',
        image: 'https://placehold.co/p1.png',
        cancelledOrders: 3,
        cancelledUnits: 4,
        orderedUnits: 7,
        cancelRate: 57,
        flagged: true,
      },
    ]);
  });

  it('lists the refunds that need attention: never recorded, failed, and pending for over a week', async () => {
    await seed();
    const service = new AnalyticsService(db.prisma as never);

    const result = await service.getAnalytics({ days: 7 });

    expect(result.refunds.needsAction).toEqual({ count: 2, amount: 45.5 });
    expect(result.refunds.stalePending).toEqual({ count: 1, amount: 10 });
    // The oldest first. The recent pending refund (r4), the cash order (r5), the card order that
    // was never paid (r6) and the refund that went through (c4) are not in the list
    expect(result.refunds.items).toEqual([
      {
        id: 'r1',
        number: '#R1',
        customer: 'User u1',
        email: 'u1@example.com',
        total: 25.5,
        kind: 'missing',
        since: at('2026-11-20T10:00:00.000Z'),
        paymentIntentId: null,
      },
      {
        id: 'r2',
        number: '#R2',
        customer: 'User u1',
        email: 'u1@example.com',
        total: 20,
        kind: 'failed',
        since: at('2026-11-21T10:00:00.000Z'),
        paymentIntentId: 'pi_2',
      },
      {
        id: 'r3',
        number: '#R3',
        customer: 'User u1',
        email: 'u1@example.com',
        total: 10,
        kind: 'pending',
        since: at('2026-11-22T10:00:00.000Z'),
        paymentIntentId: 'pi_3',
      },
    ]);
  });

  it('lists the products that are running out, the ones that sell first', async () => {
    await seed();
    const service = new AnalyticsService(db.prisma as never);

    const result = await service.getAnalytics({ days: 7 });

    // 10 units or fewer. The Untracked product (no stock number) and the Big one are never in it
    expect(result.lowStock.counts).toEqual({ low: 2, out: 1 });
    expect(result.lowStock.products).toEqual([
      {
        id: 'p3',
        name: 'Lamp',
        image: 'https://placehold.co/p3.png',
        stock: 0,
        soldInPeriod: 1,
        daysLeft: 0,
      },
      {
        id: 'p1',
        name: 'Watch',
        image: 'https://placehold.co/p1.png',
        stock: 4,
        soldInPeriod: 3,
        daysLeft: 9,
      },
      {
        id: 'p4',
        name: 'Pen',
        image: 'https://placehold.co/p4.png',
        stock: 2,
        soldInPeriod: 0,
        daysLeft: null,
      },
    ]);
  });

  it('is all zeros on an empty database', async () => {
    const service = new AnalyticsService(db.prisma as never);

    const result = await service.getAnalytics({ days: 30 });

    expect(result.summary.orders).toBe(0);
    expect(result.summary.revenue).toBe(0);
    expect(result.change).toEqual({ orders: null, revenue: null });
    expect(result.bestSellers).toEqual([]);
    expect(result.refunds.items).toEqual([]);
    expect(result.lowStock.products).toEqual([]);
  });
});
