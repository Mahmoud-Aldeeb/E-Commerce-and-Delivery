// The numbers behind the returns indicators of the analytics page: pure functions, no database

// The most rows one report reads. Above it the report says it is partial (`truncated`)
export const MAX_INSIGHT_RETURNS = 3000;
export const MAX_INSIGHT_ORDERS = 8000;
export const INSIGHT_PRODUCTS_LIMIT = 8;

interface Line {
  product: string;
  name: string;
  quantity: number;
}

// The lines of an order or of a return, as they are stored (JSON). Anything that is not a line is skipped
function readLines(value: unknown): Line[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { product, name, quantity } = entry as Record<string, unknown>;
    if (
      typeof product !== 'string' ||
      typeof quantity !== 'number' ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return [];
    }
    return [{ product, name: typeof name === 'string' ? name : '', quantity }];
  });
}

export const sumUnits = (value: unknown): number =>
  readLines(value).reduce((sum, line) => sum + line.quantity, 0);

export interface ProductUnits {
  name: string;
  units: number;
}

// Units per product over many orders (or many returns). The first name seen is kept
export function unitsByProduct(
  rows: { items: unknown }[],
): Map<string, ProductUnits> {
  const totals = new Map<string, ProductUnits>();

  for (const row of rows) {
    for (const line of readLines(row.items)) {
      const current = totals.get(line.product);
      if (current) current.units += line.quantity;
      else totals.set(line.product, { name: line.name, units: line.quantity });
    }
  }
  return totals;
}

// The percent of the delivered items that came back: a whole number, never over 100 (a return can be of
// an order that was delivered before the period), and 0 when nothing was delivered
export function returnRate(returned: number, delivered: number): number {
  if (delivered <= 0 || returned <= 0) return 0;
  return Math.min(Math.round((returned / delivered) * 100), 100);
}

export interface ReturnedProduct {
  productId: string;
  name: string;
  returned: number;
  sold: number;
  /** Returned out of sold, in percent. null when the product has no sale in the period */
  rate: number | null;
}

// The products that come back most. Units first: a product sold once and returned once is at 100%
// but is not the problem. The rate is shown next to the units
export function rankReturnedProducts(
  returned: Map<string, ProductUnits>,
  sold: Map<string, ProductUnits>,
  limit: number,
): ReturnedProduct[] {
  return [...returned.entries()]
    .map(([productId, { name, units }]) => {
      const soldUnits = sold.get(productId)?.units ?? 0;
      return {
        productId,
        name,
        returned: units,
        sold: soldUnits,
        rate: soldUnits > 0 ? returnRate(units, soldUnits) : null,
      };
    })
    .filter((item) => item.returned > 0)
    .sort(
      (a, b) =>
        b.returned - a.returned ||
        (b.rate ?? -1) - (a.rate ?? -1) ||
        a.name.localeCompare(b.name) ||
        a.productId.localeCompare(b.productId),
    )
    .slice(0, limit);
}
