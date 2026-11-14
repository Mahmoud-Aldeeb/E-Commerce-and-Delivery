import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_INSIGHT_ORDERS } from './return-insights.js';
import { ReturnsService } from './returns.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));

// Saturday 12:00 in Cairo (November is winter time, UTC+2)
const NOW = new Date('2026-11-14T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const line = (
  product: string,
  quantity: number,
  name = product.toUpperCase(),
) => ({
  product,
  name,
  quantity,
  price: 10,
});

function setup() {
  const prisma = {
    returnRequest: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi
        .fn()
        .mockResolvedValue({
          _sum: { refundAmount: null },
          _count: { _all: 0 },
        }),
    },
    order: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { service: new ReturnsService(prisma as never, {} as never), prisma };
}

describe('getInsights', () => {
  it('reads the last 7 days of the store: from the first moment of the first day to the first moment of the day after the last', async () => {
    const { service, prisma } = setup();
    const range = {
      gte: new Date('2026-11-07T22:00:00.000Z'),
      lt: new Date('2026-11-14T22:00:00.000Z'),
    };

    const result = await service.getInsights({ days: 7 } as never);

    expect(result.range).toMatchObject({
      from: '2026-11-08',
      to: '2026-11-14',
      days: 7,
    });
    expect(prisma.returnRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: range } }),
    );
    expect(prisma.returnRequest.aggregate).toHaveBeenCalledWith({
      where: { status: 'COMPLETED', completedAt: range },
      _sum: { refundAmount: true },
      _count: { _all: true },
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'Delivered', deliveredAt: range },
        take: MAX_INSIGHT_ORDERS + 1,
      }),
    );
  });

  it('covers the last 30 days when no period is given', async () => {
    const { service } = setup();

    const result = await service.getInsights({} as never);

    expect(result.range).toMatchObject({
      from: '2026-10-16',
      to: '2026-11-14',
      days: 30,
    });
  });

  it('counts the items that came back out of the items delivered, and ranks the products', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.findMany.mockResolvedValue([
      { status: 'REQUESTED', items: [line('a', 1, 'Shirt')] },
      {
        status: 'COMPLETED',
        items: [line('a', 2, 'Shirt'), line('b', 1, 'Hat')],
      },
      { status: 'REJECTED', items: [line('a', 5, 'Shirt')] }, // not an item that came back
      { status: 'CANCELLED', items: [line('c', 1, 'Cap')] }, // not either
    ]);
    prisma.order.findMany.mockResolvedValue([
      { items: [line('a', 10, 'Shirt')] },
      { items: [line('b', 5, 'Hat'), line('c', 5, 'Cap')] },
    ]);
    prisma.returnRequest.aggregate.mockResolvedValue({
      _sum: { refundAmount: 64.79 },
      _count: { _all: 1 },
    });

    const result = await service.getInsights({ days: 7 } as never);

    expect(result.summary).toEqual({
      requests: 4,
      refused: 1,
      cancelled: 1,
      returnedUnits: 4, // 1 + 2 + 1
      deliveredUnits: 20,
      returnRate: 20,
      refundedCount: 1,
      refundedAmount: 64.79,
    });
    expect(result.products).toEqual([
      { productId: 'a', name: 'Shirt', returned: 3, sold: 10, rate: 30 },
      { productId: 'b', name: 'Hat', returned: 1, sold: 5, rate: 20 },
    ]);
    expect(result.truncated).toBe(false);
  });

  it('rounds the refunded money to cents', async () => {
    const { service, prisma } = setup();
    prisma.returnRequest.aggregate.mockResolvedValue({
      _sum: { refundAmount: 0.1 + 0.2 }, // 0.30000000000000004
      _count: { _all: 2 },
    });

    const result = await service.getInsights({ days: 7 } as never);

    expect(result.summary.refundedAmount).toBe(0.3);
  });

  it('is all zeros in a period with nothing, without dividing by zero', async () => {
    const { service } = setup();

    const result = await service.getInsights({ days: 7 } as never);

    expect(result.summary).toEqual({
      requests: 0,
      refused: 0,
      cancelled: 0,
      returnedUnits: 0,
      deliveredUnits: 0,
      returnRate: 0,
      refundedCount: 0,
      refundedAmount: 0,
    });
    expect(result.products).toEqual([]);
  });

  it('says the report is partial when there are more orders than it reads, and reads only up to the limit', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue(
      Array.from({ length: MAX_INSIGHT_ORDERS + 1 }, () => ({
        items: [line('a', 1)],
      })),
    );

    const result = await service.getInsights({ days: 7 } as never);

    expect(result.truncated).toBe(true);
    expect(result.summary.deliveredUnits).toBe(MAX_INSIGHT_ORDERS);
  });
});
