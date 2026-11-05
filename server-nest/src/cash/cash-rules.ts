// The rules of the cash accounting. Pure functions: no database, no Nest.
// Money is added in CENTS (whole numbers), so 0.1 + 0.2 never drifts

// The store works in Egypt: a "day" and a "week" are the ones of this time zone
export const STORE_TIME_ZONE = 'Africa/Cairo';
export const DEFAULT_RANGE_DAYS = 7; // a report with no dates covers the last 7 days, today included
export const MAX_RANGE_DAYS = 92; // the longest period one report may cover

const HOUR_S = 3600;
const DAY_MS = 24 * HOUR_S * 1000;

export const toCents = (dollars: number) => Math.round(dollars * 100);
export const fromCents = (cents: number) => cents / 100;

// A sum of dollar amounts, worked out in cents
export const sumDollars = (amounts: number[]) =>
  fromCents(amounts.reduce((sum, amount) => sum + toCents(amount), 0));

// What was collected, what was handed over, and what is still owed
export function makeBalance(collected: number, settled: number) {
  const collectedCents = toCents(collected);
  const settledCents = toCents(settled);
  return {
    collected: fromCents(collectedCents),
    settled: fromCents(settledCents),
    owed: fromCents(collectedCents - settledCents),
  };
}

// ---------- Days and weeks of the store ----------

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The calendar day of a moment in the store time zone, like "2026-11-01"
export function dayKey(date: Date): string {
  const parts = dayFormatter.formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// A real calendar date written as "2026-11-01"
export function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

// How many days from `from` to `to` (0 for the same day)
export function daysBetween(from: string, to: string): number {
  const at = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
}

// The first moment of a calendar day in the store time zone. Found by searching, not by adding
// an offset, so the days where the clocks change are right too
export function startOfDay(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  const anchor = Date.UTC(year, month - 1, day) / 1000; // seconds
  // The day starts in any zone between 14 hours before and 12 hours after "00:00 UTC":
  // beginning 15 hours before is certainly still the previous day
  let before = anchor - 15 * HOUR_S;
  let after = anchor + 12 * HOUR_S;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (dayKey(new Date(middle * 1000)) >= key) after = middle;
    else before = middle;
  }
  return new Date(after * 1000);
}

// The Saturday that starts the week of a day (a week is Saturday to Friday)
export function weekStartOf(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday ... 6 = Saturday
  return addDays(key, -((weekday + 1) % 7));
}

// ---------- The period of a report ----------

export type RangeResult =
  { ok: true; from: string; to: string } | { ok: false; message: string };

// Both ends are days of the store. Missing ends: the end is today, and the start is 6 days before it
export function resolveRange(
  input: { from?: string; to?: string },
  now: Date,
): RangeResult {
  const to = input.to ?? dayKey(now);
  const from = input.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));

  if (!isDayKey(from) || !isDayKey(to)) {
    return { ok: false, message: 'Dates must look like 2026-11-01' };
  }
  if (from > to)
    return {
      ok: false,
      message: 'The start date must not be after the end date',
    };
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    return {
      ok: false,
      message: `A report can cover at most ${MAX_RANGE_DAYS} days`,
    };
  }
  return { ok: true, from, to };
}

// ---------- Totals by day and by week ----------

export interface CashOrderLine {
  total: number;
  deliveredAt: Date;
}

export interface SettlementLine {
  amount: number;
  settledAt: Date;
  voidedAt: Date | null;
}

export interface PeriodTotals {
  orders: number;
  collected: number;
  settled: number;
}

export interface DayTotals extends PeriodTotals {
  date: string;
}

export interface WeekTotals extends PeriodTotals {
  weekStart: string;
  weekEnd: string;
}

interface Bucket {
  orders: number;
  collectedCents: number;
  settledCents: number;
}

const finish = (bucket: Bucket): PeriodTotals => ({
  orders: bucket.orders,
  collected: fromCents(bucket.collectedCents),
  settled: fromCents(bucket.settledCents),
});

// The cash orders and the settlements of a period, added up by day, by week and in all.
// A cancelled (voided) settlement never counts. Newest first
export function buildPeriods(
  orders: CashOrderLine[],
  settlements: SettlementLine[],
) {
  const days = new Map<string, Bucket>();
  const weeks = new Map<string, Bucket>();
  const all: Bucket = { orders: 0, collectedCents: 0, settledCents: 0 };

  const bucketOf = (map: Map<string, Bucket>, key: string) => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { orders: 0, collectedCents: 0, settledCents: 0 };
      map.set(key, bucket);
    }
    return bucket;
  };

  const add = (day: string, apply: (bucket: Bucket) => void) => {
    apply(bucketOf(days, day));
    apply(bucketOf(weeks, weekStartOf(day)));
    apply(all);
  };

  for (const order of orders) {
    add(dayKey(order.deliveredAt), (bucket) => {
      bucket.orders += 1;
      bucket.collectedCents += toCents(order.total);
    });
  }
  for (const settlement of settlements) {
    if (settlement.voidedAt) continue;
    add(dayKey(settlement.settledAt), (bucket) => {
      bucket.settledCents += toCents(settlement.amount);
    });
  }

  const newestFirst = <T>(map: Map<string, T>) =>
    [...map.entries()].sort(([a], [b]) => b.localeCompare(a));

  return {
    totals: finish(all),
    days: newestFirst(days).map(([date, bucket]): DayTotals => ({
      date,
      ...finish(bucket),
    })),
    weeks: newestFirst(weeks).map(([weekStart, bucket]): WeekTotals => ({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      ...finish(bucket),
    })),
  };
}
