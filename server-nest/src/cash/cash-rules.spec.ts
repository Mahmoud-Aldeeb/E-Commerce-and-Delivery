import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildPeriods,
  dayKey,
  daysBetween,
  fromCents,
  isDayKey,
  makeBalance,
  MAX_RANGE_DAYS,
  resolveRange,
  startOfDay,
  sumDollars,
  toCents,
  weekStartOf,
  type CashOrderLine,
  type SettlementLine,
} from './cash-rules.js';

describe('toCents, fromCents and sumDollars', () => {
  it('turn dollars into whole cents', () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(100)).toBe(10000);
  });

  it('turn cents back into dollars', () => {
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(30)).toBe(0.3);
  });

  it('add amounts without the noise of floating point', () => {
    expect(sumDollars([0.1, 0.1, 0.1])).toBe(0.3);
    expect(sumDollars([10.1, 20.2, 5.05])).toBe(35.35);
    expect(sumDollars([])).toBe(0);
  });
});

describe('makeBalance', () => {
  it('gives what is owed: collected minus handed over', () => {
    expect(makeBalance(100.1, 40.05)).toEqual({
      collected: 100.1,
      settled: 40.05,
      owed: 60.05,
    });
  });

  it('is exactly zero when everything was handed over, even with noisy sums', () => {
    expect(makeBalance(0.3, 0.1 + 0.2).owed).toBe(0);
  });
});

describe('dayKey', () => {
  it('gives the calendar day of the store (Cairo is UTC+2 in winter), not the one of UTC', () => {
    expect(dayKey(new Date('2026-11-01T21:59:59.000Z'))).toBe('2026-11-01');
    expect(dayKey(new Date('2026-11-01T22:00:00.000Z'))).toBe('2026-11-02');
  });

  it('follows the summer time of Egypt (UTC+3)', () => {
    expect(dayKey(new Date('2026-07-01T20:59:59.000Z'))).toBe('2026-07-01');
    expect(dayKey(new Date('2026-07-01T21:00:00.000Z'))).toBe('2026-07-02');
  });
});

describe('isDayKey', () => {
  it.each([['2026-11-01'], ['2028-02-29'], ['2026-12-31']])(
    'accepts %s',
    (value) => {
      expect(isDayKey(value)).toBe(true);
    },
  );

  it.each([
    ['2026-02-30'],
    ['2026-13-01'],
    ['2026-1-1'],
    ['2026-11-01T10:00:00Z'],
    ['tomorrow'],
    [''],
  ])('refuses "%s"', (value) => {
    expect(isDayKey(value)).toBe(false);
  });
});

describe('addDays and daysBetween', () => {
  it('moves across months, years and leap days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDays('2026-11-01', 0)).toBe('2026-11-01');
  });

  it('counts the days between two days', () => {
    expect(daysBetween('2026-11-01', '2026-11-01')).toBe(0);
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
  });
});

describe('startOfDay', () => {
  it('is 22:00 UTC of the day before in winter', () => {
    expect(startOfDay('2026-11-02').toISOString()).toBe(
      '2026-11-01T22:00:00.000Z',
    );
  });

  it('is 21:00 UTC of the day before in summer', () => {
    expect(startOfDay('2026-07-02').toISOString()).toBe(
      '2026-07-01T21:00:00.000Z',
    );
  });

  it('is the very first moment of the day, on every day of a year (the days the clocks change too)', () => {
    for (let n = 0; n < 366; n++) {
      const key = addDays('2026-01-01', n);
      const start = startOfDay(key);

      expect(dayKey(start)).toBe(key);
      expect(dayKey(new Date(start.getTime() - 1000))).toBe(addDays(key, -1));
    }
  });
});

describe('weekStartOf', () => {
  // 2026-11-01 is a Sunday
  it('is the Saturday that starts the week', () => {
    expect(weekStartOf('2026-11-07')).toBe('2026-11-07'); // a Saturday starts its own week
    expect(weekStartOf('2026-11-01')).toBe('2026-10-31'); // Sunday
    expect(weekStartOf('2026-11-03')).toBe('2026-10-31'); // Tuesday
    expect(weekStartOf('2026-11-06')).toBe('2026-10-31'); // Friday ends the week
  });

  it('crosses a month and a year', () => {
    expect(weekStartOf('2027-01-01')).toBe('2026-12-26'); // a Friday
  });
});

describe('resolveRange', () => {
  const NOW = new Date('2026-11-03T10:00:00.000Z'); // Tuesday, 12:00 in Cairo

  it('is the last 7 days, today included, when no dates are given', () => {
    expect(resolveRange({}, NOW)).toEqual({
      ok: true,
      from: '2026-10-28',
      to: '2026-11-03',
    });
  });

  it('ends today when only the start is given', () => {
    expect(resolveRange({ from: '2026-10-01' }, NOW)).toEqual({
      ok: true,
      from: '2026-10-01',
      to: '2026-11-03',
    });
  });

  it('starts 6 days before the end when only the end is given', () => {
    expect(resolveRange({ to: '2026-11-01' }, NOW)).toEqual({
      ok: true,
      from: '2026-10-26',
      to: '2026-11-01',
    });
  });

  it('uses the day of the store, not the one of UTC', () => {
    // 23:30 UTC on the 3rd is already 01:30 on the 4th in Cairo
    expect(
      resolveRange({}, new Date('2026-11-03T23:30:00.000Z')),
    ).toMatchObject({ to: '2026-11-04' });
  });

  it('accepts one day', () => {
    expect(resolveRange({ from: '2026-11-01', to: '2026-11-01' }, NOW).ok).toBe(
      true,
    );
  });

  it('refuses a start after the end', () => {
    expect(resolveRange({ from: '2026-11-05', to: '2026-11-01' }, NOW)).toEqual(
      {
        ok: false,
        message: 'The start date must not be after the end date',
      },
    );
  });

  it.each([
    [{ from: 'nope' }],
    [{ from: '2026-02-30', to: '2026-03-01' }],
    [{ to: '2026-13-01' }],
  ])('refuses dates that are not real days: %j', (input) => {
    expect(resolveRange(input, NOW)).toEqual({
      ok: false,
      message: 'Dates must look like 2026-11-01',
    });
  });

  it('accepts the longest report and refuses one day more', () => {
    const from = '2026-08-03';

    expect(
      resolveRange({ from, to: addDays(from, MAX_RANGE_DAYS - 1) }, NOW).ok,
    ).toBe(true);
    expect(
      resolveRange({ from, to: addDays(from, MAX_RANGE_DAYS) }, NOW),
    ).toEqual({
      ok: false,
      message: `A report can cover at most ${MAX_RANGE_DAYS} days`,
    });
  });
});

describe('buildPeriods', () => {
  // Nov 1 2026 is a Sunday. The times are UTC: Cairo is 2 hours ahead
  const orders: CashOrderLine[] = [
    { total: 10.1, deliveredAt: new Date('2026-11-01T10:00:00.000Z') }, // Sunday 12:00
    { total: 20.2, deliveredAt: new Date('2026-11-01T21:30:00.000Z') }, // Sunday 23:30
    { total: 5.05, deliveredAt: new Date('2026-11-01T22:30:00.000Z') }, // already Monday 00:30
    { total: 7, deliveredAt: new Date('2026-11-07T10:00:00.000Z') }, // the next Saturday
  ];
  const settlements: SettlementLine[] = [
    {
      amount: 15,
      settledAt: new Date('2026-11-02T08:00:00.000Z'),
      voidedAt: null,
    },
    {
      amount: 100,
      settledAt: new Date('2026-11-02T09:00:00.000Z'),
      voidedAt: new Date('2026-11-02T09:05:00.000Z'),
    },
  ];

  it('adds everything up, and a voided settlement never counts', () => {
    expect(buildPeriods(orders, settlements).totals).toEqual({
      orders: 4,
      collected: 42.35,
      settled: 15,
    });
  });

  it('groups by the day of the store, newest first', () => {
    expect(buildPeriods(orders, settlements).days).toEqual([
      { date: '2026-11-07', orders: 1, collected: 7, settled: 0 },
      { date: '2026-11-02', orders: 1, collected: 5.05, settled: 15 },
      { date: '2026-11-01', orders: 2, collected: 30.3, settled: 0 },
    ]);
  });

  it('groups by week, Saturday to Friday, newest first', () => {
    expect(buildPeriods(orders, settlements).weeks).toEqual([
      {
        weekStart: '2026-11-07',
        weekEnd: '2026-11-13',
        orders: 1,
        collected: 7,
        settled: 0,
      },
      {
        weekStart: '2026-10-31',
        weekEnd: '2026-11-06',
        orders: 3,
        collected: 35.35,
        settled: 15,
      },
    ]);
  });

  it('is empty when there is nothing', () => {
    expect(buildPeriods([], [])).toEqual({
      totals: { orders: 0, collected: 0, settled: 0 },
      days: [],
      weeks: [],
    });
  });

  it('counts a day that only has a settlement', () => {
    const result = buildPeriods([], [settlements[0]]);

    expect(result.days).toEqual([
      { date: '2026-11-02', orders: 0, collected: 0, settled: 15 },
    ]);
  });

  it('does not drift when many small amounts are added', () => {
    const tenths = Array.from({ length: 3 }, () => ({
      total: 0.1,
      deliveredAt: new Date('2026-11-01T10:00:00.000Z'),
    }));

    expect(buildPeriods(tenths, []).totals.collected).toBe(0.3);
  });
});
