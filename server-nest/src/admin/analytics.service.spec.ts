import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service.js';

// The service imports it only so Nest can inject it: the tests hand it a fake instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

// Thursday 12:00 in Cairo. December is winter time (UTC+2), so every day of the period is stable
const NOW = new Date('2026-12-10T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const line = (
  product: string,
  quantity: number,
  price: number,
  name: string,
  image: string,
) => ({
  product,
  name,
  image,
  price,
  quantity,
});

// The sales of the last 7 days, newest first
const salesRows = [
  {
    createdAt: new Date('2026-12-10T08:00:00.000Z'),
    total: 30,
    discount: 5,
    items: [
      line('p1', 2, 10, 'Watch', 'w.png'),
      line('p2', 1, 10, 'Mat', 'm.png'),
    ],
  },
  {
    createdAt: new Date('2026-12-09T22:30:00.000Z'), // 00:30 of Dec 10 in Cairo
    total: 12,
    discount: 0,
    items: [line('p1', 1, 10, 'Watch', 'w.png')],
  },
  {
    createdAt: new Date('2026-12-09T21:30:00.000Z'),
    total: 20,
    discount: 0,
    items: [line('p2', 2, 10, 'Mat', 'm.png')],
  },
  {
    createdAt: new Date('2026-12-06T10:00:00.000Z'),
    total: 8,
    discount: 1,
    items: [line('p3', 1, 8, 'Lamp', 'l.png')],
  },
];

const history = (note: string) => [
  { status: 'Cancelled', note, timestamp: '2026-12-08T10:00:00.000Z' },
];

const cancelledRows = [
  {
    items: [line('p1', 1, 10, 'Watch', 'w.png')],
    statusHistory: history('Cancelled by the customer'),
  },
  {
    items: [
      line('p1', 1, 10, 'Watch', 'w.png'),
      line('p3', 1, 8, 'Lamp', 'l.png'),
    ],
    statusHistory: history(
      'Cancelled by the courier: Customer refused the order',
    ),
  },
  {
    items: [line('p1', 2, 10, 'Watch', 'w.png')],
    statusHistory: history('Cancelled by the store'),
  },
  {
    // The system cancelled it: it must not count against the product
    items: [line('p2', 5, 10, 'Mat', 'm.png')],
    statusHistory: history(
      'Cancelled automatically: an item sold out before the payment arrived',
    ),
  },
];

const SINCE = new Date('2026-11-20T10:00:00.000Z');

const refundRows = [
  {
    id: 'order-aaaa1111',
    total: 25.5,
    refundStatus: null,
    paymentIntentId: null,
    updatedAt: SINCE,
    user: { name: 'Mona', email: 'mona@example.com' },
  },
  {
    id: 'order-bbbb2222',
    total: 20,
    refundStatus: 'failed',
    paymentIntentId: 'pi_2',
    updatedAt: SINCE,
    user: { name: 'Hany', email: 'hany@example.com' },
  },
  {
    id: 'order-cccc3333',
    total: 10,
    refundStatus: 'pending',
    paymentIntentId: 'pi_3',
    updatedAt: SINCE,
    user: { name: 'Sara', email: 'sara@example.com' },
  },
];

const refundGroups = [
  { refundStatus: null, _count: { _all: 1 }, _sum: { total: 25.5 } },
  { refundStatus: 'failed', _count: { _all: 2 }, _sum: { total: 40.25 } },
  { refundStatus: 'pending', _count: { _all: 1 }, _sum: { total: 10 } },
];

const lowStockRows = [
  { id: 'p1', name: 'Watch', image: 'w.png', stock: 4 },
  { id: 'p9', name: 'Old lamp', image: 'l.png', stock: 0 },
  { id: 'p8', name: 'Pen', image: 'pen.png', stock: 2 },
];

interface Data {
  sales?: unknown[];
  cancelled?: unknown[];
  refundRows?: unknown[];
  refundGroups?: unknown[];
  lowStock?: unknown[];
  previous?: { count: number; total: number | null };
  cancelledCount?: number;
  lowCount?: number;
  outCount?: number;
}

// The database answers each question from the lists above. The questions are told apart by their filter
function setup(data: Data = {}) {
  const {
    sales = salesRows,
    cancelled = cancelledRows,
    refundRows: refunds = refundRows,
    refundGroups: groups = refundGroups,
    lowStock = lowStockRows,
    previous = { count: 2, total: 50 },
    cancelledCount = 4,
    lowCount = 2,
    outCount = 1,
  } = data;

  const prisma = {
    order: {
      findMany: vi.fn(
        async ({ where }: { where: { OR?: unknown; status?: unknown } }) => {
          if (where.OR) return refunds; // the refunds that need attention
          if (where.status === 'Cancelled') return cancelled; // the cancelled orders of the period
          return sales; // the sales of the period
        },
      ),
      aggregate: vi
        .fn()
        .mockResolvedValue({
          _count: { _all: previous.count },
          _sum: { total: previous.total },
        }),
      count: vi.fn().mockResolvedValue(cancelledCount),
      groupBy: vi.fn().mockResolvedValue(groups),
    },
    product: {
      findMany: vi.fn(async ({ where }: { where: { id?: unknown } }) =>
        where.id
          ? [
              { id: 'p1', stock: 4 },
              { id: 'p2', stock: 50 },
            ] // the stock of the best sellers today (p3 is gone)
          : lowStock,
      ),
      count: vi.fn(async ({ where }: { where: { stock: unknown } }) =>
        where.stock === 0 ? outCount : lowCount,
      ),
    },
  };
  return { service: new AnalyticsService(prisma as never), prisma };
}

describe('the period', () => {
  it('is the last 30 days of the store, today included, when no number is given', async () => {
    const { service } = setup();

    const result = await service.getAnalytics({});

    expect(result.range).toEqual({
      from: '2026-11-11',
      to: '2026-12-10',
      days: 30,
      timeZone: 'Africa/Cairo',
    });
    expect(result.days).toHaveLength(30);
  });

  it('reads 7 days from the first moment of the first day to the first moment of the day after the last', async () => {
    const { service, prisma } = setup();

    const result = await service.getAnalytics({ days: 7 });

    expect(result.range).toMatchObject({
      from: '2026-12-04',
      to: '2026-12-10',
      days: 7,
    });
    // Cairo is UTC+2: Dec 4 starts at 22:00 UTC of Dec 3, and Dec 11 at 22:00 UTC of Dec 10
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        status: { not: 'Cancelled' },
        NOT: [{ paymentMethod: 'card', isPaid: false }],
        createdAt: {
          gte: new Date('2026-12-03T22:00:00.000Z'),
          lt: new Date('2026-12-10T22:00:00.000Z'),
        },
      },
      select: { createdAt: true, total: true, discount: true, items: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 8001,
    });
  });

  it('compares with the 7 days before it', async () => {
    const { service, prisma } = setup();

    await service.getAnalytics({ days: 7 });

    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        status: { not: 'Cancelled' },
        NOT: [{ paymentMethod: 'card', isPaid: false }],
        createdAt: {
          gte: new Date('2026-11-26T22:00:00.000Z'),
          lt: new Date('2026-12-03T22:00:00.000Z'),
        },
      },
      _count: { _all: true },
      _sum: { total: true },
    });
  });
});

describe('the sales', () => {
  it('adds up the orders, the revenue and the average, and compares them with the days before', async () => {
    const { service } = setup();

    const result = await service.getAnalytics({ days: 7 });

    expect(result.summary).toEqual({
      orders: 4,
      revenue: 70,
      discount: 6,
      averageOrder: 17.5,
      bestDay: { date: '2026-12-10', revenue: 42 },
      cancelledOrders: 4,
      cancelRate: 50, // 4 cancelled of 8 orders placed
    });
    expect(result.previous).toEqual({ orders: 2, revenue: 50 });
    expect(result.change).toEqual({ orders: 100, revenue: 40 });
  });

  it('gives every day with its sales, the empty days too, by the day of the store', async () => {
    const { service } = setup();

    const result = await service.getAnalytics({ days: 7 });

    expect(
      result.days.map((day) => [day.date, day.orders, day.revenue]),
    ).toEqual([
      ['2026-12-04', 0, 0],
      ['2026-12-05', 0, 0],
      ['2026-12-06', 1, 8],
      ['2026-12-07', 0, 0],
      ['2026-12-08', 0, 0],
      ['2026-12-09', 1, 20],
      ['2026-12-10', 2, 42],
    ]);
  });

  it('has no change when nothing was sold in the days before', async () => {
    const { service } = setup({ previous: { count: 0, total: null } });

    const result = await service.getAnalytics({ days: 7 });

    expect(result.previous).toEqual({ orders: 0, revenue: 0 });
    expect(result.change).toEqual({ orders: null, revenue: null });
  });

  it('is all zeros when there is nothing at all', async () => {
    const { service } = setup({
      sales: [],
      cancelled: [],
      refundRows: [],
      refundGroups: [],
      lowStock: [],
      previous: { count: 0, total: null },
      cancelledCount: 0,
      lowCount: 0,
      outCount: 0,
    });

    const result = await service.getAnalytics({ days: 7 });

    expect(result.summary).toEqual({
      orders: 0,
      revenue: 0,
      discount: 0,
      averageOrder: 0,
      bestDay: null,
      cancelledOrders: 0,
      cancelRate: 0,
    });
    expect(result.bestSellers).toEqual([]);
    expect(result.cancelledProducts).toEqual([]);
    expect(result.lowStock).toEqual({
      counts: { low: 0, out: 0 },
      products: [],
    });
    expect(result.refunds.needsAction).toEqual({ count: 0, amount: 0 });
  });

  it('says the report is partial when there are more orders than it reads, and reads only up to the limit', async () => {
    const many = Array.from({ length: 8001 }, () => ({
      createdAt: new Date('2026-12-10T08:00:00.000Z'),
      total: 1,
      discount: 0,
      items: [],
    }));
    const { service } = setup({ sales: many });

    const result = await service.getAnalytics({ days: 7 });

    expect(result.truncated).toBe(true);
    expect(result.summary.orders).toBe(8000);
  });

  it('is not partial for a normal number of orders', async () => {
    const { service } = setup();

    await expect(service.getAnalytics({ days: 7 })).resolves.toMatchObject({
      truncated: false,
    });
  });
});

describe('the best sellers', () => {
  it('ranks the products by units sold, with the stock of TODAY', async () => {
    const { service, prisma } = setup();

    const result = await service.getAnalytics({ days: 7 });

    expect(result.bestSellers).toEqual([
      {
        productId: 'p1',
        name: 'Watch',
        image: 'w.png',
        units: 3,
        revenue: 30,
        orders: 2,
        stock: 4,
      },
      {
        productId: 'p2',
        name: 'Mat',
        image: 'm.png',
        units: 3,
        revenue: 30,
        orders: 2,
        stock: 50,
      },
      {
        productId: 'p3',
        name: 'Lamp',
        image: 'l.png',
        units: 1,
        revenue: 8,
        orders: 1,
        stock: null,
      }, // gone
    ]);
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['p1', 'p2', 'p3'] } },
      select: { id: true, stock: true },
    });
  });

  it('does not ask for any stock when nothing was sold', async () => {
    const { service, prisma } = setup({ sales: [] });

    await service.getAnalytics({ days: 7 });

    expect(prisma.product.findMany).toHaveBeenCalledTimes(1); // only the low stock question
  });
});

describe('the products in cancelled orders', () => {
  it('flags a product that is often in cancelled orders, and leaves out the orders the system cancelled', async () => {
    const { service } = setup();

    const result = await service.getAnalytics({ days: 7 });

    // The Watch is in 3 cancelled orders (4 units) and 3 units stood: 4 of 7 units is 57%.
    // The Mat is in one order that the system cancelled (sold out): not counted.
    // The Lamp is in one cancelled order only: not listed
    expect(result.cancelledProducts).toEqual([
      {
        productId: 'p1',
        name: 'Watch',
        image: 'w.png',
        cancelledOrders: 3,
        cancelledUnits: 4,
        orderedUnits: 7,
        cancelRate: 57,
        flagged: true,
      },
    ]);
  });

  it('counts the cancelled orders of the period (all of them) for the cancel rate', async () => {
    const { service, prisma } = setup();

    await service.getAnalytics({ days: 7 });

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        status: 'Cancelled',
        createdAt: {
          gte: new Date('2026-12-03T22:00:00.000Z'),
          lt: new Date('2026-12-10T22:00:00.000Z'),
        },
      },
    });
  });
});

describe('the refunds that need attention', () => {
  it('lists what is wrong with each, oldest first, and counts what needs an action apart from what is only late', async () => {
    const { service } = setup();

    const result = await service.getAnalytics({ days: 7 });

    expect(result.refunds).toEqual({
      needsAction: { count: 3, amount: 65.75 }, // one never recorded and two failed
      stalePending: { count: 1, amount: 10 },
      staleAfterDays: 7,
      items: [
        {
          id: 'order-aaaa1111',
          number: '#AAAA1111',
          customer: 'Mona',
          email: 'mona@example.com',
          total: 25.5,
          kind: 'missing',
          since: SINCE,
          paymentIntentId: null,
        },
        {
          id: 'order-bbbb2222',
          number: '#BBBB2222',
          customer: 'Hany',
          email: 'hany@example.com',
          total: 20,
          kind: 'failed',
          since: SINCE,
          paymentIntentId: 'pi_2',
        },
        {
          id: 'order-cccc3333',
          number: '#CCCC3333',
          customer: 'Sara',
          email: 'sara@example.com',
          total: 10,
          kind: 'pending',
          since: SINCE,
          paymentIntentId: 'pi_3',
        },
      ],
    });
  });

  it('asks only for cancelled card orders that were paid and are not refunded, or are pending for over 7 days', async () => {
    const { service, prisma } = setup();

    await service.getAnalytics({ days: 7 });

    const where = {
      status: 'Cancelled',
      paymentMethod: 'card',
      isPaid: true,
      OR: [
        { refundStatus: null },
        { refundStatus: 'failed' },
        {
          refundStatus: 'pending',
          updatedAt: { lt: new Date('2026-12-03T10:00:00.000Z') },
        },
      ],
    };
    expect(prisma.order.groupBy).toHaveBeenCalledWith({
      by: ['refundStatus'],
      where,
      _count: { _all: true },
      _sum: { total: true },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where,
      select: {
        id: true,
        total: true,
        refundStatus: true,
        paymentIntentId: true,
        updatedAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 20,
    });
  });
});

describe('the products that are running out', () => {
  it('puts the product that sells first, with the days its stock lasts, and an item nobody buys after it', async () => {
    const { service, prisma } = setup();

    const result = await service.getAnalytics({ days: 7 });

    expect(result.lowStock.counts).toEqual({ low: 2, out: 1 });
    // The Watch sold 3 units in 7 days: its 4 units last about 9 days
    expect(result.lowStock.products).toEqual([
      {
        id: 'p1',
        name: 'Watch',
        image: 'w.png',
        stock: 4,
        soldInPeriod: 3,
        daysLeft: 9,
      },
      {
        id: 'p9',
        name: 'Old lamp',
        image: 'l.png',
        stock: 0,
        soldInPeriod: 0,
        daysLeft: 0,
      },
      {
        id: 'p8',
        name: 'Pen',
        image: 'pen.png',
        stock: 2,
        soldInPeriod: 0,
        daysLeft: null,
      },
    ]);
    // 10 or fewer (the number of the low stock email). A product with no stock number is never in it
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { stock: { lte: 10 } },
      select: { id: true, name: true, image: true, stock: true },
      orderBy: [{ stock: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: { stock: { gt: 0, lte: 10 } },
    });
    expect(prisma.product.count).toHaveBeenCalledWith({ where: { stock: 0 } });
  });
});
