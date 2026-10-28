import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { InsufficientStockError, takeStock } from './stock.util.js';

// A fake transaction: only the one method takeStock calls, answering from the list we give.
// `counts[0]` is the answer of the first call, `counts[1]` of the second, and so on
function fakeTransaction(counts: number[]) {
  const updateMany = vi.fn();
  for (const count of counts) updateMany.mockResolvedValueOnce({ count });
  const tx = { product: { updateMany } } as unknown as Prisma.TransactionClient;
  return { tx, updateMany };
}

describe('takeStock', () => {
  it('takes the stock of every item with a condition on the stock', async () => {
    const { tx, updateMany } = fakeTransaction([1, 1]);

    await takeStock(tx, [
      { product: 'a', quantity: 2 },
      { product: 'b', quantity: 5 },
    ]);

    expect(updateMany).toHaveBeenCalledTimes(2);
    // The condition (stock >= quantity) and the decrease travel in the SAME call
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'a', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
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
    expect((error as InsufficientStockError).message).toBe(
      'Not enough stock for product b',
    );
  });

  it('stops at the first short item and does not touch the next ones', async () => {
    const { tx, updateMany } = fakeTransaction([0, 1]);

    await expect(
      takeStock(tx, [
        { product: 'a', quantity: 1 },
        { product: 'b', quantity: 1 },
      ]),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty list', async () => {
    const { tx, updateMany } = fakeTransaction([]);

    await takeStock(tx, []);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
