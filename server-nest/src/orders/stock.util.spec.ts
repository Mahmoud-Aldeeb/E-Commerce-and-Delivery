import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import {
  InsufficientStockError,
  restoreStock,
  takeStock,
} from './stock.util.js';

type UpdateManyArgs = { where: { id: string }; data?: unknown };

// A fake transaction: only the methods the functions call. `products[0]` is the answer of the first
// call on `product.updateMany`, `variants[0]` of the first call on `productVariant.updateMany`.
// After the listed answers, every call answers { count: 1 }. `log` keeps the order of ALL the calls
function fakeTransaction(products: number[] = [], variants: number[] = []) {
  const log: string[] = [];

  const makeUpdateMany = (kind: string, answers: number[]) => {
    const queue = [...answers];
    return vi.fn(async (args: UpdateManyArgs) => {
      log.push(`${kind}:${args.where.id}`);
      // `??` and not `||`: an answer of 0 ("nothing was updated") must stay 0
      return { count: queue.shift() ?? 1 };
    });
  };
  const productCalls = makeUpdateMany('product', products);
  const variantCalls = makeUpdateMany('variant', variants);

  const tx = {
    product: { updateMany: productCalls },
    productVariant: { updateMany: variantCalls },
  } as unknown as Prisma.TransactionClient;

  return { tx, log, productCalls, variantCalls };
}

describe('takeStock', () => {
  it('takes the stock of every item with a condition on the stock', async () => {
    const { tx, productCalls } = fakeTransaction([1, 1]);

    await takeStock(tx, [
      { product: 'a', quantity: 2 },
      { product: 'b', quantity: 5 },
    ]);

    expect(productCalls).toHaveBeenCalledTimes(2);
    // The condition (stock >= quantity) and the decrease travel in the SAME call
    expect(productCalls).toHaveBeenNthCalledWith(1, {
      where: { id: 'a', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(productCalls).toHaveBeenNthCalledWith(2, {
      where: { id: 'b', stock: { gte: 5 } },
      data: { stock: { decrement: 5 } },
    });
  });

  it('throws InsufficientStockError with the id of the short product', async () => {
    const { tx } = fakeTransaction([1, 0]); // the second item is short

    const error = await takeStock(tx, [
      { product: 'a', quantity: 1 },
      { product: 'b', quantity: 1 },
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).productId).toBe('b');
    expect((error as InsufficientStockError).variantId).toBeNull();
    expect((error as InsufficientStockError).message).toBe(
      'Not enough stock for product b',
    );
  });

  it('stops at the first short item and does not touch the next ones', async () => {
    const { tx, productCalls } = fakeTransaction([0, 1]);

    await expect(
      takeStock(tx, [
        { product: 'a', quantity: 1 },
        { product: 'b', quantity: 1 },
      ]),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(productCalls).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty list', async () => {
    const { tx, productCalls, variantCalls } = fakeTransaction();

    await takeStock(tx, []);

    expect(productCalls).not.toHaveBeenCalled();
    expect(variantCalls).not.toHaveBeenCalled();
  });

  it('takes the stock of a VARIANT, with its product in the condition, and the total of the product too', async () => {
    const { tx, productCalls, variantCalls } = fakeTransaction();

    await takeStock(tx, [{ product: 'p', variant: 'v', quantity: 2 }]);

    expect(variantCalls).toHaveBeenCalledWith({
      where: { id: 'v', productId: 'p', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    // The total of the product only goes down by what the variant gave: no condition of its own
    expect(productCalls).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: { stock: { decrement: 2 } },
    });
  });

  it('throws with the variant id when the variant is short, and leaves the total of the product alone', async () => {
    const { tx, productCalls } = fakeTransaction([], [0]);

    const error = await takeStock(tx, [
      { product: 'p', variant: 'v', quantity: 9 },
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).productId).toBe('p');
    expect((error as InsufficientStockError).variantId).toBe('v');
    expect(productCalls).not.toHaveBeenCalled();
  });

  it('takes every VARIANT first and every PRODUCT after, each group in a fixed order whatever order the items come in', async () => {
    const { tx, log } = fakeTransaction();

    await takeStock(tx, [
      { product: 'b', quantity: 1 },
      { product: 'a', variant: 'z', quantity: 1 },
      { product: 'a', variant: 'y', quantity: 1 },
    ]);

    expect(log).toEqual(['variant:y', 'variant:z', 'product:a', 'product:b']);
  });

  it('never touches a product between two variants (the deadlock of two orders on the same product)', async () => {
    // Order 1 = a/y + a/z, order 2 = a/z. If order 1 locked product a between y and z,
    // the two orders would wait for each other forever
    const first = fakeTransaction();
    await takeStock(first.tx, [
      { product: 'a', variant: 'y', quantity: 1 },
      { product: 'a', variant: 'z', quantity: 1 },
    ]);
    const second = fakeTransaction();
    await takeStock(second.tx, [{ product: 'a', variant: 'z', quantity: 1 }]);

    expect(first.log).toEqual(['variant:y', 'variant:z', 'product:a']);
    expect(second.log).toEqual(['variant:z', 'product:a']);
  });

  it('lowers the total of a product ONCE by what all its variants gave', async () => {
    const { tx, productCalls } = fakeTransaction();

    await takeStock(tx, [
      { product: 'a', variant: 'y', quantity: 2 },
      { product: 'a', variant: 'z', quantity: 3 },
    ]);

    expect(productCalls).toHaveBeenCalledTimes(1);
    expect(productCalls).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { stock: { decrement: 5 } },
    });
  });

  it('joins the same item sent twice, so the condition looks at the whole quantity', async () => {
    const { tx, productCalls } = fakeTransaction();

    await takeStock(tx, [
      { product: 'a', quantity: 1 },
      { product: 'a', quantity: 2 },
    ]);

    expect(productCalls).toHaveBeenCalledTimes(1);
    expect(productCalls).toHaveBeenCalledWith({
      where: { id: 'a', stock: { gte: 3 } },
      data: { stock: { decrement: 3 } },
    });
  });
});

describe('restoreStock', () => {
  it('puts the items back on the shelves', async () => {
    const { tx, productCalls } = fakeTransaction();

    await restoreStock(tx, [
      { product: 'a', quantity: 2 },
      { product: 'b', quantity: 1 },
    ]);

    expect(productCalls).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { stock: { increment: 2 } },
    });
    expect(productCalls).toHaveBeenNthCalledWith(2, {
      where: { id: 'b' },
      data: { stock: { increment: 1 } },
    });
  });

  it('puts a variant back, and the total of its product with it', async () => {
    const { tx, productCalls, variantCalls } = fakeTransaction();

    await restoreStock(tx, [{ product: 'p', variant: 'v', quantity: 3 }]);

    expect(variantCalls).toHaveBeenCalledWith({
      where: { id: 'v', productId: 'p' },
      data: { stock: { increment: 3 } },
    });
    expect(productCalls).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: { stock: { increment: 3 } },
    });
  });

  it('does not grow the total of the product when the variant was deleted since', async () => {
    const { tx, productCalls } = fakeTransaction([], [0]); // the variant is gone: nothing was updated

    await restoreStock(tx, [{ product: 'p', variant: 'v', quantity: 3 }]);

    expect(productCalls).not.toHaveBeenCalled();
  });

  it('puts every VARIANT back first and every PRODUCT after (once each), like takeStock', async () => {
    const { tx, log, productCalls } = fakeTransaction();

    await restoreStock(tx, [
      { product: 'b', quantity: 1 },
      { product: 'a', variant: 'z', quantity: 2 },
      { product: 'a', variant: 'y', quantity: 3 },
    ]);

    expect(log).toEqual(['variant:y', 'variant:z', 'product:a', 'product:b']);
    expect(productCalls).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { stock: { increment: 5 } },
    });
  });

  it('grows the total of a product only by the variants that really got stock back', async () => {
    // Sorted by id: y is updated first (count 1), z is gone (count 0)
    const { tx, productCalls } = fakeTransaction([], [1, 0]);

    await restoreStock(tx, [
      { product: 'a', variant: 'y', quantity: 2 },
      { product: 'a', variant: 'z', quantity: 5 },
    ]);

    expect(productCalls).toHaveBeenCalledTimes(1);
    expect(productCalls).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { stock: { increment: 2 } },
    });
  });

  it('skips entries that do not look right instead of blocking the cancellation', async () => {
    const { tx, productCalls, variantCalls } = fakeTransaction();

    await restoreStock(tx, [
      null,
      'text',
      { product: 7, quantity: 1 }, // the product id is not a string
      { product: 'a', quantity: 0 },
      { product: 'a', quantity: -2 },
      { product: 'a', quantity: 1.5 },
      { product: 'ok', quantity: 4 },
    ]);

    // Only the one good entry reaches the database
    expect(productCalls).toHaveBeenCalledTimes(1);
    expect(productCalls).toHaveBeenCalledWith({
      where: { id: 'ok' },
      data: { stock: { increment: 4 } },
    });
    expect(variantCalls).not.toHaveBeenCalled();
  });

  it('does nothing when what the order stored is not a list', async () => {
    const { tx, productCalls, variantCalls } = fakeTransaction();

    await restoreStock(tx, null);
    await restoreStock(tx, undefined);
    await restoreStock(tx, { product: 'a', quantity: 1 });
    await restoreStock(tx, 'items');

    expect(productCalls).not.toHaveBeenCalled();
    expect(variantCalls).not.toHaveBeenCalled();
  });

  it('treats an item with an empty or null variant like an item of the past (no variant)', async () => {
    const { tx, productCalls, variantCalls } = fakeTransaction();

    await restoreStock(tx, [
      { product: 'a', variant: null, quantity: 1 },
      { product: 'b', variant: '', quantity: 2 },
    ]);

    expect(variantCalls).not.toHaveBeenCalled();
    expect(productCalls).toHaveBeenNthCalledWith(1, {
      where: { id: 'a' },
      data: { stock: { increment: 1 } },
    });
    expect(productCalls).toHaveBeenNthCalledWith(2, {
      where: { id: 'b' },
      data: { stock: { increment: 2 } },
    });
  });
});
