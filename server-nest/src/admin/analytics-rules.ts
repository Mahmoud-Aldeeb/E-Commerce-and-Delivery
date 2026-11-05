import {
  addDays,
  dayKey,
  daysBetween,
  fromCents,
  toCents,
} from '../cash/cash-rules.js';

// The numbers of the admin dashboard. Pure functions: no database, no Nest.
// Money is added in CENTS, so a sum never drifts

// The note of an order that the system cancelled after the customer paid for an item that sold
// out (OrderCancellationService.cancelOutOfStock). It says nothing about the product
export const AUTO_CANCEL_NOTE_PREFIX = 'Cancelled automatically';

// A product is listed once it is in this many cancelled orders...
export const MIN_CANCELLED_ORDERS_TO_LIST = 2;
// ...and flagged when it is in this many, and this share of its ordered units was cancelled
export const FLAG_MIN_CANCELLED_ORDERS = 3;
export const FLAG_MIN_RATE_PERCENT = 25;

export interface ItemLine {
  productId: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
}

// An order keeps its items as JSON: [{ product, name, image, price, quantity }].
// Nothing in it is trusted: a line that does not look right is skipped
export function readItems(value: unknown): ItemLine[] {
  if (!Array.isArray(value)) return [];

  const lines: ItemLine[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;

    const quantity = Number(item.quantity);
    const price = Number(item.price);
    if (typeof item.product !== 'string' || item.product === '') continue;
    if (!Number.isInteger(quantity) || quantity < 1) continue;
    if (!Number.isFinite(price) || price < 0) continue;

    lines.push({
      productId: item.product,
      name:
        typeof item.name === 'string' && item.name
          ? item.name
          : 'Unknown product',
      image: typeof item.image === 'string' ? item.image : '',
      price,
      quantity,
    });
  }
  return lines;
}

export function isAutoCancelled(statusHistory: unknown): boolean {
  if (!Array.isArray(statusHistory)) return false;
  return statusHistory.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const { status, note } = entry as { status?: unknown; note?: unknown };
    return (
      status === 'Cancelled' &&
      typeof note === 'string' &&
      note.startsWith(AUTO_CANCEL_NOTE_PREFIX)
    );
  });
}

// ---------- Sales by day ----------

export interface DailySales {
  date: string;
  orders: number;
  revenue: number;
  discount: number;
}

// Every day of the period, the empty ones too (a chart needs them), oldest first.
// A day is a calendar day of the store (Cairo time)
export function buildDailySales(
  orders: { createdAt: Date; total: number; discount: number }[],
  from: string,
  to: string,
): DailySales[] {
  const buckets = new Map<
    string,
    { orders: number; revenueCents: number; discountCents: number }
  >();
  const length = daysBetween(from, to) + 1;
  for (let n = 0; n < length; n++) {
    buckets.set(addDays(from, n), {
      orders: 0,
      revenueCents: 0,
      discountCents: 0,
    });
  }

  for (const order of orders) {
    const bucket = buckets.get(dayKey(order.createdAt));
    if (!bucket) continue; // outside the period
    bucket.orders += 1;
    bucket.revenueCents += toCents(order.total);
    bucket.discountCents += toCents(order.discount);
  }

  return [...buckets.entries()].map(([date, bucket]) => ({
    date,
    orders: bucket.orders,
    revenue: fromCents(bucket.revenueCents),
    discount: fromCents(bucket.discountCents),
  }));
}

export function summarizeDays(days: DailySales[]) {
  let orders = 0;
  let revenueCents = 0;
  let discountCents = 0;
  let best: DailySales | null = null;

  for (const day of days) {
    orders += day.orders;
    revenueCents += toCents(day.revenue);
    discountCents += toCents(day.discount);
    // A tie keeps the earliest day
    if (day.revenue > 0 && (best === null || day.revenue > best.revenue))
      best = day;
  }

  return {
    orders,
    revenue: fromCents(revenueCents),
    discount: fromCents(discountCents),
    averageOrder:
      orders === 0 ? 0 : fromCents(Math.round(revenueCents / orders)),
    bestDay: best ? { date: best.date, revenue: best.revenue } : null,
  };
}

// How much the number moved against the period before, in whole percent.
// null = there was nothing before to compare with
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// ---------- Products ----------

export interface ProductTotals {
  name: string;
  image: string;
  units: number;
  revenueCents: number;
  /** The number of ORDERS the product is in (twice in one order counts once) */
  orders: number;
}

// The caller gives the NEWEST orders first: the name and the image come from the first line seen
export function totalsByProduct(
  orders: { items: unknown }[],
): Map<string, ProductTotals> {
  const totals = new Map<string, ProductTotals>();

  for (const order of orders) {
    const countedInThisOrder = new Set<string>();
    for (const line of readItems(order.items)) {
      let entry = totals.get(line.productId);
      if (!entry) {
        entry = {
          name: line.name,
          image: line.image,
          units: 0,
          revenueCents: 0,
          orders: 0,
        };
        totals.set(line.productId, entry);
      }
      entry.units += line.quantity;
      entry.revenueCents += toCents(line.price) * line.quantity;
      if (!countedInThisOrder.has(line.productId)) {
        countedInThisOrder.add(line.productId);
        entry.orders += 1;
      }
    }
  }
  return totals;
}

export interface BestSeller {
  productId: string;
  name: string;
  image: string;
  units: number;
  revenue: number;
  orders: number;
}

export function topSellers(
  totals: Map<string, ProductTotals>,
  limit: number,
): BestSeller[] {
  return [...totals.entries()]
    .map(([productId, entry]) => ({
      productId,
      name: entry.name,
      image: entry.image,
      units: entry.units,
      revenue: fromCents(entry.revenueCents),
      orders: entry.orders,
    }))
    .sort(
      (a, b) =>
        b.units - a.units ||
        b.revenue - a.revenue ||
        a.productId.localeCompare(b.productId),
    )
    .slice(0, limit);
}

export interface CancelledProduct {
  productId: string;
  name: string;
  image: string;
  cancelledOrders: number;
  cancelledUnits: number;
  /** Units ordered in all: the cancelled ones and the ones that stood */
  orderedUnits: number;
  /** The share of the ordered units that was cancelled, in whole percent */
  cancelRate: number;
  flagged: boolean;
}

// The products that are in cancelled orders most often. A cancelled order is not always the fault of
// the product (the customer changed his mind, nobody opened the door): this shows a pattern, not a verdict
export function rankCancelledProducts(
  cancelled: Map<string, ProductTotals>,
  sold: Map<string, ProductTotals>,
  limit: number,
): CancelledProduct[] {
  const rows: CancelledProduct[] = [];

  for (const [productId, entry] of cancelled) {
    if (entry.orders < MIN_CANCELLED_ORDERS_TO_LIST) continue;

    const orderedUnits = entry.units + (sold.get(productId)?.units ?? 0);
    const cancelRate = Math.round((entry.units / orderedUnits) * 100);
    rows.push({
      productId,
      name: entry.name,
      image: entry.image,
      cancelledOrders: entry.orders,
      cancelledUnits: entry.units,
      orderedUnits,
      cancelRate,
      flagged:
        entry.orders >= FLAG_MIN_CANCELLED_ORDERS &&
        cancelRate >= FLAG_MIN_RATE_PERCENT,
    });
  }

  return rows
    .sort(
      (a, b) =>
        b.cancelledOrders - a.cancelledOrders ||
        b.cancelRate - a.cancelRate ||
        a.productId.localeCompare(b.productId),
    )
    .slice(0, limit);
}

// ---------- Stock ----------

// How many days the stock lasts at the pace of the period: null when nothing was sold (no pace)
export function paceDaysLeft(
  stock: number,
  unitsSold: number,
  periodDays: number,
): number | null {
  if (stock <= 0) return 0;
  if (unitsSold <= 0 || periodDays <= 0) return null;
  const perDay = unitsSold / periodDays;
  return Math.max(1, Math.round(stock / perDay));
}

export interface LowStockRow {
  id: string;
  name: string;
  image: string;
  stock: number;
  soldInPeriod: number;
  daysLeft: number | null;
}

// The products that sell and run out soonest first. A product nobody bought comes after them
// (an item that was taken off the shelf on purpose is not an emergency)
export function sortLowStock(rows: LowStockRow[]): LowStockRow[] {
  const demand = (row: LowStockRow) => (row.soldInPeriod > 0 ? 0 : 1);
  return [...rows].sort(
    (a, b) =>
      demand(a) - demand(b) ||
      (a.daysLeft ?? 0) - (b.daysLeft ?? 0) ||
      a.stock - b.stock ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

// ---------- Refunds ----------

export type RefundKind = 'missing' | 'failed' | 'pending';

// null = the order was cancelled but no refund was ever recorded
export function refundKind(status: string | null): RefundKind {
  if (status === null) return 'missing';
  if (status === 'failed') return 'failed';
  return 'pending';
}
