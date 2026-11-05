import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CashService } from './cash.service.js';

// The service imports it only so Nest can inject it: the tests hand it a fake instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

const NOW = new Date('2026-11-03T10:00:00.000Z'); // Tuesday, 12:00 in Cairo

// The time is frozen: "today", "this week" and the default period depend on it
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// A delivered order that was paid in cash
const CASH_DELIVERED = { status: 'Delivered', paymentMethod: { not: 'card' } };

const SETTLEMENT_FIELDS = {
  id: true,
  amount: true,
  note: true,
  settledAt: true,
  voidedAt: true,
};

// `collected` and `settled` are what the database sums up for the courier "d1"
function setup({
  collected = 0,
  settled = 0,
}: { collected?: number; settled?: number } = {}) {
  const prisma = {
    deliveryPartner: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'd1',
          name: 'Omar',
          phone: '0100',
          isActive: true,
        }),
    },
    order: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: collected } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cashSettlement: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: settled } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: 's1',
        voidedAt: null,
        ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  return { service: new CashService(prisma as never), prisma };
}

describe('getOverview', () => {
  it('lists every courier with what he collected, handed over and owes, the biggest debt first', async () => {
    const { service, prisma } = setup();
    const lastSettled = new Date('2026-11-02T18:00:00.000Z');
    prisma.deliveryPartner.findMany.mockResolvedValue([
      {
        id: 'p3',
        name: 'Sara',
        phone: '03',
        vehicleType: 'car',
        isActive: false,
      },
      {
        id: 'p1',
        name: 'Ali',
        phone: '01',
        vehicleType: 'bike',
        isActive: true,
      },
      {
        id: 'p2',
        name: 'Omar',
        phone: '02',
        vehicleType: 'scooter',
        isActive: true,
      },
    ]);
    prisma.order.groupBy.mockResolvedValue([
      { deliveryPartnerId: 'p1', _sum: { total: 100.5 }, _count: { _all: 3 } },
      { deliveryPartnerId: 'p2', _sum: { total: 50 }, _count: { _all: 1 } },
    ]);
    prisma.cashSettlement.groupBy.mockResolvedValue([
      {
        partnerId: 'p1',
        _sum: { amount: 40.25 },
        _max: { settledAt: lastSettled },
      },
    ]);

    const result = await service.getOverview();

    expect(
      result.partners.map((row) => [
        row.name,
        row.collected,
        row.settled,
        row.owed,
        row.cashOrders,
      ]),
    ).toEqual([
      ['Ali', 100.5, 40.25, 60.25, 3],
      ['Omar', 50, 0, 50, 1],
      ['Sara', 0, 0, 0, 0], // a courier with no cash is listed too
    ]);
    expect(result.partners[0].lastSettledAt).toEqual(lastSettled);
    expect(result.partners[2].lastSettledAt).toBeNull();
    expect(result.totals).toEqual({
      collected: 150.5,
      settled: 40.25,
      owed: 110.25,
    });
  });

  it('asks only for delivered cash orders of a courier, and only for settlements that were not voided', async () => {
    const { service, prisma } = setup();

    await service.getOverview();

    expect(prisma.order.groupBy).toHaveBeenCalledWith({
      by: ['deliveryPartnerId'],
      where: { deliveryPartnerId: { not: null }, ...CASH_DELIVERED },
      _sum: { total: true },
      _count: { _all: true },
    });
    expect(prisma.cashSettlement.groupBy).toHaveBeenCalledWith({
      by: ['partnerId'],
      where: { voidedAt: null },
      _sum: { amount: true },
      _max: { settledAt: true },
    });
  });

  it('works when there is no courier at all', async () => {
    const { service } = setup();

    await expect(service.getOverview()).resolves.toEqual({
      partners: [],
      totals: { collected: 0, settled: 0, owed: 0 },
    });
  });
});

describe('getPartnerLedger', () => {
  it('answers "not found" for a courier that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.deliveryPartner.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.getPartnerLedger('nope', {}));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('refuses dates that are not real days', async () => {
    const { service, prisma } = setup();

    const error = await failureOf(
      service.getPartnerLedger('d1', { from: 'nope' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'Dates must look like 2026-11-01');
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('refuses a period longer than 92 days', async () => {
    const { service } = setup();

    const error = await failureOf(
      service.getPartnerLedger('d1', { from: '2026-01-01', to: '2026-12-31' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'A report can cover at most 92 days',
    );
  });

  it('reads the period in the time of the store: from the start of the first day to the start of the day after the last', async () => {
    const { service, prisma } = setup();

    const result = await service.getPartnerLedger('d1', {
      from: '2026-11-01',
      to: '2026-11-07',
    });

    // Cairo is UTC+2 in November: the 1st starts at 22:00 UTC of Oct 31, and the 8th at 22:00 UTC of Nov 7
    const period = {
      gte: new Date('2026-10-31T22:00:00.000Z'),
      lt: new Date('2026-11-07T22:00:00.000Z'),
    };
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deliveryPartnerId: 'd1',
          ...CASH_DELIVERED,
          deliveredAt: period,
        },
      }),
    );
    expect(prisma.cashSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { partnerId: 'd1', settledAt: period },
      }),
    );
    expect(result.range).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
      timeZone: 'Africa/Cairo',
    });
  });

  it('covers the last 7 days when no dates are given', async () => {
    vi.setSystemTime(new Date('2026-12-10T10:00:00.000Z')); // winter, Thursday
    const { service, prisma } = setup();

    const result = await service.getPartnerLedger('d1', {});

    expect(result.range).toMatchObject({
      from: '2026-12-04',
      to: '2026-12-10',
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveredAt: {
            gte: new Date('2026-12-03T22:00:00.000Z'),
            lt: new Date('2026-12-10T22:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('gives the balance since ever, the totals of the period and the days and weeks', async () => {
    const { service, prisma } = setup({ collected: 200, settled: 50 });
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'o-2222bbbb',
        total: 20.2,
        deliveredAt: new Date('2026-11-02T20:00:00.000Z'),
        user: { name: 'Hany' },
      },
      {
        id: 'o-1111aaaa',
        total: 10.1,
        deliveredAt: new Date('2026-11-02T10:00:00.000Z'),
        user: { name: 'Mona' },
      },
      {
        id: 'o-0000none',
        total: 99,
        deliveredAt: null,
        user: { name: 'Nobody' },
      }, // never counted
    ]);
    prisma.cashSettlement.findMany.mockResolvedValue([
      {
        id: 's1',
        amount: 15,
        note: 'Evening',
        settledAt: new Date('2026-11-03T08:00:00.000Z'),
        voidedAt: null,
        recordedBy: { name: 'Admin' },
      },
      {
        id: 's2',
        amount: 99,
        note: null,
        settledAt: new Date('2026-11-03T09:00:00.000Z'),
        voidedAt: new Date('2026-11-03T09:05:00.000Z'),
        recordedBy: null,
      },
    ]);

    const result = await service.getPartnerLedger('d1', {
      from: '2026-11-01',
      to: '2026-11-07',
    });

    expect(result.partner).toEqual({
      id: 'd1',
      name: 'Omar',
      phone: '0100',
      isActive: true,
    });
    expect(result.balance).toEqual({ collected: 200, settled: 50, owed: 150 });
    expect(result.totals).toEqual({ orders: 2, collected: 30.3, settled: 15 });
    expect(result.days).toEqual([
      { date: '2026-11-03', orders: 0, collected: 0, settled: 15 },
      { date: '2026-11-02', orders: 2, collected: 30.3, settled: 0 },
    ]);
    expect(result.weeks).toEqual([
      {
        weekStart: '2026-10-31',
        weekEnd: '2026-11-06',
        orders: 2,
        collected: 30.3,
        settled: 15,
      },
    ]);
    expect(
      result.orders.map((order) => [order.number, order.total, order.customer]),
    ).toEqual([
      ['#2222BBBB', 20.2, 'Hany'],
      ['#1111AAAA', 10.1, 'Mona'],
    ]);
    // A voided settlement is shown (with the moment it was cancelled), but it is not in the totals
    expect(result.settlements).toEqual([
      {
        id: 's1',
        amount: 15,
        note: 'Evening',
        settledAt: new Date('2026-11-03T08:00:00.000Z'),
        voidedAt: null,
        recordedBy: 'Admin',
      },
      {
        id: 's2',
        amount: 99,
        note: null,
        settledAt: new Date('2026-11-03T09:00:00.000Z'),
        voidedAt: new Date('2026-11-03T09:05:00.000Z'),
        recordedBy: null,
      },
    ]);
    expect(result.ordersTruncated).toBe(false);
  });

  it('cuts the list of orders at 300, but the totals count all of them', async () => {
    const { service, prisma } = setup();
    prisma.order.findMany.mockResolvedValue(
      Array.from({ length: 305 }, (_, index) => ({
        id: `order-${String(index).padStart(8, '0')}`,
        total: 1,
        deliveredAt: new Date('2026-11-02T10:00:00.000Z'),
        user: { name: 'Mona' },
      })),
    );

    const result = await service.getPartnerLedger('d1', {
      from: '2026-11-01',
      to: '2026-11-07',
    });

    expect(result.orders).toHaveLength(300);
    expect(result.ordersTruncated).toBe(true);
    expect(result.totals).toMatchObject({ orders: 305, collected: 305 });
  });
});

describe('recordSettlement', () => {
  it('answers "not found" for a courier that does not exist', async () => {
    const { service, prisma } = setup({ collected: 100 });
    prisma.deliveryPartner.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.recordSettlement('admin1', 'nope', { amount: 10 }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.cashSettlement.create).not.toHaveBeenCalled();
  });

  it('saves the handover, who recorded it and when, and gives the new balance', async () => {
    const { service, prisma } = setup({ collected: 100 });
    // Before the handover he had given 0, after it 40
    prisma.cashSettlement.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 40 } });

    const result = await service.recordSettlement('admin1', 'd1', {
      amount: 40,
      note: '  Evening handover  ',
    });

    expect(prisma.cashSettlement.create).toHaveBeenCalledWith({
      data: {
        partnerId: 'd1',
        amount: 40,
        note: 'Evening handover',
        settledAt: NOW,
        recordedById: 'admin1',
      },
      select: SETTLEMENT_FIELDS,
    });
    expect(result.balance).toEqual({ collected: 100, settled: 40, owed: 60 });
  });

  it('uses the date the admin chose', async () => {
    const { service, prisma } = setup({ collected: 100 });
    const yesterday = new Date('2026-11-02T18:00:00.000Z');

    await service.recordSettlement('admin1', 'd1', {
      amount: 10,
      settledAt: yesterday,
    });

    expect(
      prisma.cashSettlement.create.mock.calls[0][0].data.settledAt,
    ).toEqual(yesterday);
  });

  it.each([[undefined], ['   ']])(
    'saves a note of %j as no note',
    async (note) => {
      const { service, prisma } = setup({ collected: 100 });

      await service.recordSettlement('admin1', 'd1', { amount: 10, note });

      expect(
        prisma.cashSettlement.create.mock.calls[0][0].data.note,
      ).toBeNull();
    },
  );

  it('refuses more than the courier owes, and says how much he owes', async () => {
    const { service, prisma } = setup({ collected: 100, settled: 40 });

    const error = await failureOf(
      service.recordSettlement('admin1', 'd1', { amount: 60.01 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'This courier owes $60.00. You cannot record more than that',
    );
    expect(prisma.cashSettlement.create).not.toHaveBeenCalled();
  });

  it('accepts exactly what he owes', async () => {
    const { service, prisma } = setup({ collected: 100, settled: 40 });

    await service.recordSettlement('admin1', 'd1', { amount: 60 });

    expect(prisma.cashSettlement.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a handover from a courier who owes nothing', async () => {
    const { service, prisma } = setup({ collected: 100, settled: 100 });

    const error = await failureOf(
      service.recordSettlement('admin1', 'd1', { amount: 1 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'This courier owes nothing right now',
    );
    expect(prisma.cashSettlement.create).not.toHaveBeenCalled();
  });

  it('refuses a date in the future, but allows a few minutes of clock difference', async () => {
    const { service, prisma } = setup({ collected: 100 });
    const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);

    const error = await failureOf(
      service.recordSettlement('admin1', 'd1', {
        amount: 10,
        settledAt: minutes(6),
      }),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'The date cannot be in the future');
    expect(prisma.cashSettlement.create).not.toHaveBeenCalled();

    await service.recordSettlement('admin1', 'd1', {
      amount: 10,
      settledAt: minutes(4),
    });
    expect(prisma.cashSettlement.create).toHaveBeenCalledTimes(1);
  });
});

describe('voidSettlement', () => {
  it('answers "not found" for a settlement that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.cashSettlement.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.voidSettlement('s9'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.cashSettlement.updateMany).not.toHaveBeenCalled();
  });

  it('cancels it, with the condition that it was not cancelled before', async () => {
    const { service, prisma } = setup();
    prisma.cashSettlement.findUnique.mockResolvedValue({
      id: 's1',
      voidedAt: null,
    });

    const result = await service.voidSettlement('s1');

    expect(prisma.cashSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', voidedAt: null },
      data: { voidedAt: NOW },
    });
    expect(result).toEqual({ message: 'Settlement cancelled' });
  });

  it('does nothing when it was already cancelled (so the first cancellation keeps its moment)', async () => {
    const { service, prisma } = setup();
    prisma.cashSettlement.findUnique.mockResolvedValue({
      id: 's1',
      voidedAt: new Date('2026-11-01T10:00:00.000Z'),
    });

    await expect(service.voidSettlement('s1')).resolves.toEqual({
      message: 'Settlement cancelled',
    });
    expect(prisma.cashSettlement.updateMany).not.toHaveBeenCalled();
  });
});

describe('getMyCash', () => {
  it('gives the courier his own balance, today, this week and his last handovers', async () => {
    const { service, prisma } = setup({ collected: 80, settled: 30 });
    prisma.order.findMany.mockResolvedValue([
      { total: 10, deliveredAt: new Date('2026-11-03T08:00:00.000Z') }, // today
      { total: 2.5, deliveredAt: new Date('2026-11-02T22:30:00.000Z') }, // 00:30 today in Cairo
      { total: 5, deliveredAt: new Date('2026-11-01T10:00:00.000Z') }, // Sunday: this week, not today
      { total: 99, deliveredAt: null }, // never counted
    ]);
    const handovers = [
      {
        id: 's1',
        amount: 30,
        note: null,
        settledAt: new Date('2026-11-02T18:00:00.000Z'),
      },
    ];
    prisma.cashSettlement.findMany.mockResolvedValue(handovers);

    const result = await service.getMyCash('d1');

    expect(result.balance).toEqual({ collected: 80, settled: 30, owed: 50 });
    expect(result.today).toEqual({ orders: 2, collected: 12.5 });
    expect(result.week).toEqual({
      weekStart: '2026-10-31',
      orders: 3,
      collected: 17.5,
    });
    expect(result.settlements).toEqual(handovers);
  });

  it('reads only his own orders, from the Saturday that starts the week, and only handovers that were not voided', async () => {
    const { service, prisma } = setup();

    await service.getMyCash('d1');

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: {
        deliveryPartnerId: 'd1',
        ...CASH_DELIVERED,
        deliveredAt: { gte: new Date('2026-10-30T22:00:00.000Z') }, // Saturday Oct 31 00:00 in Cairo
      },
      select: { total: true, deliveredAt: true },
    });
    expect(prisma.cashSettlement.findMany).toHaveBeenCalledWith({
      where: { partnerId: 'd1', voidedAt: null },
      orderBy: [{ settledAt: 'desc' }, { id: 'asc' }],
      take: 10,
      select: { id: true, amount: true, note: true, settledAt: true },
    });
  });

  it('is all zeros for a courier with no cash', async () => {
    const { service } = setup();

    await expect(service.getMyCash('d1')).resolves.toEqual({
      balance: { collected: 0, settled: 0, owed: 0 },
      today: { orders: 0, collected: 0 },
      week: { weekStart: '2026-10-31', orders: 0, collected: 0 },
      settlements: [],
    });
  });
});
