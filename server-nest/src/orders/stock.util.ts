import type { Prisma } from '../generated/prisma/client.js';

// `variant` is the id of the size/colour of a product that has them. An order of the past has none
export type StoredItem = {
  product: string;
  variant?: string | null;
  quantity: number;
};

export class InsufficientStockError extends Error {
  readonly productId: string;
  readonly variantId: string | null;

  constructor(productId: string, variantId: string | null = null) {
    super(
      variantId
        ? `Not enough stock for product ${productId} (variant ${variantId})`
        : `Not enough stock for product ${productId}`,
    );
    this.name = 'InsufficientStockError';
    this.productId = productId;
    this.variantId = variantId;
  }
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// ONE lock order for the whole app, because two transactions that lock the same rows in a different
// order can wait for each other forever (a deadlock):
//   1) every VARIANT, by id
//   2) then every PRODUCT, by id
// takeStock, restoreStock and the admin who saves variants all follow it

type Line = { product: string; variant: string | null; quantity: number };
type VariantLine = Line & { variant: string };

const hasVariant = (line: Line): line is VariantLine => line.variant !== null;

// One line per (product, variant): the same item twice in a cart becomes one line with the sum
function mergeLines(items: StoredItem[]): Line[] {
  const merged = new Map<string, Line>();
  for (const item of items) {
    const variant = item.variant || null;
    const key = `${item.product}|${variant ?? ''}`;
    const line = merged.get(key);
    if (line) line.quantity += item.quantity;
    else
      merged.set(key, {
        product: item.product,
        variant,
        quantity: item.quantity,
      });
  }
  return [...merged.values()];
}

// The two groups of the lock order: the variants (by id), then the products without variants
function inLockOrder(items: StoredItem[]) {
  const lines = mergeLines(items);
  return {
    variantLines: lines
      .filter(hasVariant)
      .sort(
        (a, b) =>
          compare(a.variant, b.variant) || compare(a.product, b.product),
      ),
    plainLines: lines.filter((line) => !hasVariant(line)),
  };
}

const addTo = (map: Map<string, number>, key: string, amount: number) =>
  map.set(key, (map.get(key) ?? 0) + amount);

const sortedKeys = (...maps: Map<string, number>[]) =>
  [...new Set(maps.flatMap((map) => [...map.keys()]))].sort(compare);

// Takes the stock of every item. Run it INSIDE a transaction: if one item is short,
// the error rolls back the whole transaction, so no other item is touched
export async function takeStock(
  tx: Prisma.TransactionClient,
  items: StoredItem[],
): Promise<void> {
  const { variantLines, plainLines } = inLockOrder(items);

  // 1) The variants. What the variants of each product gave is added up for step 2
  const fromVariants = new Map<string, number>();
  for (const line of variantLines) {
    const { count } = await tx.productVariant.updateMany({
      // The condition and the decrease are ONE statement: nobody can slip in between.
      // The product is part of the condition: a variant of another product is never touched
      where: {
        id: line.variant,
        productId: line.product,
        stock: { gte: line.quantity },
      },
      data: { stock: { decrement: line.quantity } },
    });
    if (count === 0)
      throw new InsufficientStockError(line.product, line.variant);
    addTo(fromVariants, line.product, line.quantity);
  }

  // 2) The products. The product keeps the TOTAL of its variants (the cards, the filters and the
  // alerts read it), so it goes down once by what its variants gave, with no condition of its own
  const plain = new Map<string, number>();
  for (const line of plainLines) addTo(plain, line.product, line.quantity);

  for (const productId of sortedKeys(fromVariants, plain)) {
    const plainQuantity = plain.get(productId);
    if (plainQuantity) {
      const { count } = await tx.product.updateMany({
        where: { id: productId, stock: { gte: plainQuantity } },
        data: { stock: { decrement: plainQuantity } },
      });
      if (count === 0) throw new InsufficientStockError(productId);
    }

    const variantQuantity = fromVariants.get(productId);
    if (variantQuantity) {
      await tx.product.updateMany({
        where: { id: productId },
        data: { stock: { decrement: variantQuantity } },
      });
    }
  }
}

const isUsable = (item: unknown): item is StoredItem =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as StoredItem).product === 'string' &&
  Number.isInteger((item as StoredItem).quantity) &&
  (item as StoredItem).quantity > 0;

// Puts the items of a cancelled order back on the shelves. `items` is what the order stored (JSON):
// an entry that does not look right is skipped, because a cancellation must never be blocked by it.
// updateMany: a product or a variant that was deleted since does not abort anything
export async function restoreStock(
  tx: Prisma.TransactionClient,
  items: unknown,
): Promise<void> {
  if (!Array.isArray(items)) return;

  const usable: StoredItem[] = items.filter(isUsable).map((item) => ({
    product: item.product,
    // Anything that is not a real id is treated like an order of the past (no variant)
    variant:
      typeof item.variant === 'string' && item.variant ? item.variant : null,
    quantity: item.quantity,
  }));
  const { variantLines, plainLines } = inLockOrder(usable);

  // What really went back, per product: that is what the total of the product grows by
  const back = new Map<string, number>();

  for (const line of variantLines) {
    const { count } = await tx.productVariant.updateMany({
      where: { id: line.variant, productId: line.product },
      data: { stock: { increment: line.quantity } },
    });
    // A variant that is gone got nothing back: the total of its product must not grow
    if (count > 0) addTo(back, line.product, line.quantity);
  }
  for (const line of plainLines) addTo(back, line.product, line.quantity);

  for (const [productId, quantity] of [...back].sort(([a], [b]) =>
    compare(a, b),
  )) {
    await tx.product.updateMany({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });
  }
}
