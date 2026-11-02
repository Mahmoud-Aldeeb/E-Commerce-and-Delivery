export type Star = 1 | 2 | 3 | 4 | 5;

export interface RatingSummary {
  /** The average of the visible ratings, to 2 decimals. 0 when there is none */
  average: number;
  count: number;
  /** How many reviews gave each star */
  distribution: Record<Star, number>;
}

const MAX_FIRST_NAME = 30;

// The name shown next to a review: the first name and the first letter of the last one.
// "Mahmoud Aldeeb" -> "Mahmoud A.". The full name and the email stay private
export function authorLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';

  const first = parts[0].slice(0, MAX_FIRST_NAME);
  if (parts.length === 1) return first;

  // [...word] splits by character, not by UTF-16 unit: safe for any alphabet
  const initial = [...parts[parts.length - 1]][0].toUpperCase();
  return `${first} ${initial}.`;
}

// Turns "how many reviews gave each star" into the numbers a page shows
export function summarize(
  rows: { rating: number; count: number }[],
): RatingSummary {
  const distribution: Record<Star, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let sum = 0;

  for (const row of rows) {
    if (!Number.isInteger(row.rating) || row.rating < 1 || row.rating > 5)
      continue;
    distribution[row.rating as Star] += row.count;
    count += row.count;
    sum += row.rating * row.count;
  }

  const average = count === 0 ? 0 : Math.round((sum / count) * 100) / 100;
  return { average, count, distribution };
}

// Did this customer receive the product? `orders` are their delivered orders.
// An order keeps its items as JSON: a list of { product: <product id>, quantity, ... }
export function boughtProduct(
  orders: { items: unknown }[],
  productId: string,
): boolean {
  return orders.some(
    (order) =>
      Array.isArray(order.items) &&
      order.items.some(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          (item as { product?: unknown }).product === productId,
      ),
  );
}
