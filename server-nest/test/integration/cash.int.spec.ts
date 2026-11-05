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
import { CashService } from '../../src/cash/cash.service.js';
import { makeOrder, makePartner, makeUser } from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The service imports it only so Nest can inject it: the tests hand it the real client instead
vi.mock('../../src/prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

// Tuesday 12:00 in Cairo (November is winter time, UTC+2)
const NOW = new Date('2026-11-03T10:00:00.000Z');

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

// The courier "d1" delivered 3 cash orders (35.30 dollars), one card order and gave 15 dollars back
async function seed() {
  const prisma = db.prisma;
  await makeUser(prisma, 'u1');
  await makeUser(prisma, 'admin1', { role: 'ADMIN' });
  await makePartner(prisma, 'd1');
  await makePartner(prisma, 'd2', { name: 'Sara' });

  const delivered = { status: 'Delivered', deliveryPartnerId: 'd1' };
  await makeOrder(prisma, 'u1', 'o1', {
    ...delivered,
    total: 10.1,
    deliveredAt: at('2026-11-02T10:00:00.000Z'),
  });
  await makeOrder(prisma, 'u1', 'o2', {
    ...delivered,
    total: 20.2,
    deliveredAt: at('2026-11-02T20:00:00.000Z'),
  });
  await makeOrder(prisma, 'u1', 'o3', {
    ...delivered,
    total: 5,
    deliveredAt: at('2026-10-20T10:00:00.000Z'),
  });
  // Not cash he collected: paid by card, or cancelled
  await makeOrder(prisma, 'u1', 'o4', {
    ...delivered,
    paymentMethod: 'card',
    isPaid: true,
    total: 99,
    deliveredAt: at('2026-11-02T10:00:00.000Z'),
  });
  await makeOrder(prisma, 'u1', 'o5', {
    deliveryPartnerId: 'd1',
    status: 'Cancelled',
    total: 50,
  });
  // Another courier
  await makeOrder(prisma, 'u1', 'o6', {
    status: 'Delivered',
    deliveryPartnerId: 'd2',
    total: 7,
    deliveredAt: at('2026-11-02T12:00:00.000Z'),
  });

  await prisma.cashSettlement.create({
    data: {
      id: 's1',
      partnerId: 'd1',
      amount: 15,
      note: 'Evening',
      settledAt: at('2026-11-03T08:00:00.000Z'),
    },
  });
  // A wrong entry that was cancelled: it must not count
  await prisma.cashSettlement.create({
    data: {
      id: 's2',
      partnerId: 'd1',
      amount: 99,
      settledAt: at('2026-11-03T09:00:00.000Z'),
      voidedAt: at('2026-11-03T09:05:00.000Z'),
    },
  });
}

describe('the cash on a real database', () => {
  it('works out what every courier collected, handed over and owes, the biggest debt first', async () => {
    await seed();
    const service = new CashService(db.prisma as never);

    const result = await service.getOverview();

    expect(
      result.partners.map((row) => [
        row.id,
        row.cashOrders,
        row.collected,
        row.settled,
        row.owed,
      ]),
    ).toEqual([
      ['d1', 3, 35.3, 15, 20.3],
      ['d2', 1, 7, 0, 7],
    ]);
    expect(result.partners[0].lastSettledAt).toEqual(
      at('2026-11-03T08:00:00.000Z'),
    ); // the cancelled entry is not it
    expect(result.partners[1].lastSettledAt).toBeNull();
    expect(result.totals).toEqual({ collected: 42.3, settled: 15, owed: 27.3 });
  });

  it('gives the ledger of one courier: the balance since ever, and the period by day and by week', async () => {
    await seed();
    const service = new CashService(db.prisma as never);

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
    expect(result.balance).toEqual({
      collected: 35.3,
      settled: 15,
      owed: 20.3,
    });
    expect(result.totals).toEqual({ orders: 2, collected: 30.3, settled: 15 });
    expect(result.days).toEqual([
      { date: '2026-11-03', orders: 0, collected: 0, settled: 15 },
      { date: '2026-11-02', orders: 2, collected: 30.3, settled: 0 }, // 22:00 in Cairo is still Nov 2
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
      ['#O2', 20.2, 'User u1'],
      ['#O1', 10.1, 'User u1'],
    ]);
    // The cancelled entry is in the history, with its moment, but it is not in the totals
    expect(
      result.settlements.map((entry) => [
        entry.id,
        entry.amount,
        entry.voidedAt,
      ]),
    ).toEqual([
      ['s2', 99, at('2026-11-03T09:05:00.000Z')],
      ['s1', 15, null],
    ]);
  });

  it('gives the courier his own balance, today, this week and his handovers', async () => {
    await seed();
    const service = new CashService(db.prisma as never);

    const result = await service.getMyCash('d1');

    expect(result.balance).toEqual({
      collected: 35.3,
      settled: 15,
      owed: 20.3,
    });
    expect(result.today).toEqual({ orders: 0, collected: 0 });
    expect(result.week).toEqual({
      weekStart: '2026-10-31',
      orders: 2,
      collected: 30.3,
    });
    expect(result.settlements.map((entry) => entry.id)).toEqual(['s1']);
  });

  it('records a handover, refuses more than the courier owes, and a cancelled one gives the money back', async () => {
    await seed();
    const service = new CashService(db.prisma as never);

    const tooMuch = await service
      .recordSettlement('admin1', 'd1', { amount: 20.31 })
      .catch((caught: unknown) => caught);
    expect(tooMuch).toBeInstanceOf(BadRequestException);
    expect(tooMuch).toHaveProperty(
      'message',
      'This courier owes $20.30. You cannot record more than that',
    );

    const recorded = await service.recordSettlement('admin1', 'd1', {
      amount: 20.3,
      note: 'The rest',
    });
    expect(recorded.balance).toEqual({
      collected: 35.3,
      settled: 35.3,
      owed: 0,
    });
    const saved = await db.prisma.cashSettlement.findUniqueOrThrow({
      where: { id: recorded.settlement.id },
    });
    expect(saved).toMatchObject({
      partnerId: 'd1',
      amount: 20.3,
      recordedById: 'admin1',
      settledAt: NOW,
    });

    const nothingLeft = await service
      .recordSettlement('admin1', 'd1', { amount: 1 })
      .catch((caught: unknown) => caught);
    expect(nothingLeft).toHaveProperty(
      'message',
      'This courier owes nothing right now',
    );

    await service.voidSettlement(recorded.settlement.id);
    const after = await service.getMyCash('d1');
    expect(after.balance.owed).toBe(20.3);
  });
});
