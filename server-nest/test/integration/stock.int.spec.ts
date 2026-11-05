import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  InsufficientStockError,
  takeStock,
} from '../../src/orders/stock.util.js';
import { makeProduct } from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

let db: TestDatabase;

beforeAll(() => {
  db = createTestPrisma();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDatabase(db.prisma);
});

const stockOf = async (id: string) =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { stock: true },
    })
  ).stock;

// Every call is its own transaction on its own connection, so they really run at the same time
const takeInTransaction = (items: { product: string; quantity: number }[]) =>
  db.prisma.$transaction((tx) => takeStock(tx, items));

describe('takeStock on a real database', () => {
  it('never sells more than the stock when many orders take it at the same moment', async () => {
    await makeProduct(db.prisma, 'p1', { stock: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        takeInTransaction([{ product: 'p1', quantity: 1 }]),
      ),
    );

    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(5);
    // The seven that lost failed because the stock was gone, and not for any other reason
    expect(failed).toHaveLength(7);
    for (const result of failed)
      expect(result.reason).toBeInstanceOf(InsufficientStockError);
    expect(await stockOf('p1')).toBe(0);
  });

  it('never lets the stock go below zero when the orders ask for different quantities', async () => {
    await makeProduct(db.prisma, 'p1', { stock: 10 });

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        takeInTransaction([{ product: 'p1', quantity: 3 }]),
      ),
    );

    // 10 units: three orders of 3 fit (9 units), the other three do not
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    expect(await stockOf('p1')).toBe(1);
  });

  it('puts back what was taken from the first item when the second item is short (the transaction rolls back)', async () => {
    await makeProduct(db.prisma, 'a', { stock: 5 });
    await makeProduct(db.prisma, 'b', { stock: 1 });

    const error = await takeInTransaction([
      { product: 'a', quantity: 2 },
      { product: 'b', quantity: 2 },
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).productId).toBe('b');
    expect(await stockOf('a')).toBe(5);
    expect(await stockOf('b')).toBe(1);
  });

  it('takes exactly what is left, and then refuses', async () => {
    await makeProduct(db.prisma, 'p1', { stock: 3 });

    await takeInTransaction([{ product: 'p1', quantity: 3 }]);
    expect(await stockOf('p1')).toBe(0);

    await expect(
      takeInTransaction([{ product: 'p1', quantity: 1 }]),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await stockOf('p1')).toBe(0);
  });
});
