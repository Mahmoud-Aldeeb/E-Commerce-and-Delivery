import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CashService } from './cash.service.js';

// The service imports it only so Nest can inject it: the tests hand it a fake instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

// Tuesday 12:00 in Cairo (November is winter time, UTC+2)
const NOW = new Date('2026-11-03T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

const CASH_DELIVERED = {
  status: 'Delivered',
  paymentMethod: { notIn: ['card', 'wallet'] },
};

function setup() {
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
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { total: 0, walletAmountUsed: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    cashSettlement: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
  };
  return { service: new CashService(prisma as never), prisma };
}

describe('cash with the store wallet', () => {
  it('counts what the courier collected: the total minus what the wallet paid', async () => {
    const { service, prisma } = setup();
    prisma.deliveryPartner.findMany.mockResolvedValue([
      {
        id: 'd1',
        name: 'Omar',
        phone: '0100',
        vehicleType: 'bike',
        isActive: true,
      },
    ]);
    // 2 delivered orders of $100 in all, and the wallet paid $30 of it
    prisma.order.groupBy.mockResolvedValue([
      {
        deliveryPartnerId: 'd1',
        _sum: { total: 100, walletAmountUsed: 30 },
        _count: { _all: 2 },
      },
    ]);

    const result = await service.getOverview();

    expect(result.partners[0]).toMatchObject({
      id: 'd1',
      cashOrders: 2,
      collected: 70,
      settled: 0,
      owed: 70,
    });
    expect(result.totals).toEqual({ collected: 70, settled: 0, owed: 70 });
  });

  it('does not count an order the wallet paid in full as cash', async () => {
    const { service, prisma } = setup();

    await service.getOverview();

    expect(prisma.order.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deliveryPartnerId: { not: null }, ...CASH_DELIVERED },
        _sum: { total: true, walletAmountUsed: true },
      }),
    );
  });

  it('refuses a handover above what the courier collected (the wallet part is not his)', async () => {
    const { service, prisma } = setup();
    prisma.order.aggregate.mockResolvedValue({
      _sum: { total: 100, walletAmountUsed: 30 },
    });

    const error = await failureOf(
      service.recordSettlement('admin1', 'd1', { amount: 70.01 } as never),
    );

    expect(prisma.order.aggregate).toHaveBeenCalledWith({
      where: { deliveryPartnerId: 'd1', ...CASH_DELIVERED },
      _sum: { total: true, walletAmountUsed: true },
    });
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'This courier owes $70.00. You cannot record more than that',
    );
    expect(prisma.cashSettlement.create).not.toHaveBeenCalled();
  });

  it('shows on each order of the ledger what the courier collected', async () => {
    const { service, prisma } = setup();
    prisma.order.aggregate.mockResolvedValue({
      _sum: { total: 50, walletAmountUsed: 5 },
    });
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'abcdef12-3456',
        total: 50,
        walletAmountUsed: 5,
        deliveredAt: new Date('2026-11-02T10:00:00.000Z'),
        user: { name: 'Mona' },
      },
    ]);

    const result = await service.getPartnerLedger('d1', {
      from: '2026-11-01',
      to: '2026-11-07',
    } as never);

    expect(result.orders[0]).toMatchObject({ total: 45, customer: 'Mona' });
    expect(result.balance).toEqual({ collected: 45, settled: 0, owed: 45 });
    expect(result.totals).toMatchObject({ orders: 1, collected: 45 });
  });

  it('gives the courier his own numbers without the wallet part', async () => {
    const { service, prisma } = setup();
    prisma.order.aggregate.mockResolvedValue({
      _sum: { total: 60, walletAmountUsed: 10 },
    });
    prisma.order.findMany.mockResolvedValue([
      {
        total: 30,
        walletAmountUsed: 5,
        deliveredAt: new Date('2026-11-03T08:00:00.000Z'),
      }, // today
      {
        total: 30,
        walletAmountUsed: 5,
        deliveredAt: new Date('2026-11-02T08:00:00.000Z'),
      }, // yesterday
    ]);

    const result = await service.getMyCash('d1');

    expect(result.balance).toEqual({ collected: 50, settled: 0, owed: 50 });
    expect(result.today).toEqual({ orders: 1, collected: 25 });
    expect(result.week).toEqual({
      weekStart: '2026-10-31',
      orders: 2,
      collected: 50,
    });
  });
});
