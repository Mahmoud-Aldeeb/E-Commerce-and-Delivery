import type { Prisma } from '../generated/prisma/client.js';

export type StoredItem = { product: string; quantity: number };

export class InsufficientStockError extends Error {
  readonly productId: string;

  constructor(productId: string) {
    super(`Not enough stock for product ${productId}`);
    this.name = 'InsufficientStockError';
    this.productId = productId;
  }
}

// Takes the stock of every item. Run it INSIDE a transaction: if one item is short,
// the error rolls back the whole transaction, so no other item is touched
export async function takeStock(
  tx: Prisma.TransactionClient,
  items: StoredItem[],
): Promise<void> {
  for (const item of items) {
    const { count } = await tx.product.updateMany({
      // The condition and the decrease are ONE statement: nobody can slip in between
      where: { id: item.product, stock: { gte: item.quantity } },
      data: { stock: { decrement: item.quantity } },
    });

    if (count === 0) throw new InsufficientStockError(item.product);
  }
}
