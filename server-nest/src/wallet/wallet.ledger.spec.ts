import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import {
  creditWallet,
  debitWallet,
  InsufficientWalletError,
  type WalletEntry,
} from './wallet.ledger.js';

const entry = (overrides: Partial<WalletEntry> = {}): WalletEntry => ({
  userId: 'u1',
  cents: 500,
  type: 'RETURN_REFUND',
  reference: 'return:r1',
  returnId: 'r1',
  ...overrides,
});

// A fake transaction: only the methods the functions call
function fakeTransaction(balanceAfter = 1500, updated = 1) {
  const tx = {
    user: {
      update: vi.fn().mockResolvedValue({ walletBalanceCents: balanceAfter }),
      updateMany: vi.fn().mockResolvedValue({ count: updated }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ walletBalanceCents: balanceAfter }),
    },
    walletTransaction: { create: vi.fn().mockResolvedValue({}) },
  };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}

describe('creditWallet', () => {
  it('adds the money, writes the ledger entry with the new balance, and gives the balance back', async () => {
    const { tx, client } = fakeTransaction(1500);

    const balance = await creditWallet(client, entry());

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { walletBalanceCents: { increment: 500 } },
      select: { walletBalanceCents: true },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'RETURN_REFUND',
        amountCents: 500,
        balanceAfterCents: 1500,
        reference: 'return:r1',
        orderId: null,
        returnId: 'r1',
      },
    });
    expect(balance).toBe(1500);
  });

  it.each([0, -5, 1.5])(
    'refuses an amount of %j cents, and touches nothing',
    async (cents) => {
      const { tx, client } = fakeTransaction();

      await expect(creditWallet(client, entry({ cents }))).rejects.toThrow(
        RangeError,
      );

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    },
  );
});

describe('debitWallet', () => {
  it('takes the money only if the balance is enough (the condition is in the same statement), and writes a negative entry', async () => {
    const { tx, client } = fakeTransaction(700);

    const balance = await debitWallet(
      client,
      entry({
        cents: 300,
        type: 'ORDER_PAYMENT',
        reference: 'order:o1',
        orderId: 'o1',
        returnId: undefined,
      }),
    );

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', walletBalanceCents: { gte: 300 } },
      data: { walletBalanceCents: { decrement: 300 } },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        type: 'ORDER_PAYMENT',
        amountCents: -300,
        balanceAfterCents: 700,
        reference: 'order:o1',
        orderId: 'o1',
        returnId: null,
      },
    });
    expect(balance).toBe(700);
  });

  it('throws InsufficientWalletError and writes nothing when the balance is short', async () => {
    const { tx, client } = fakeTransaction(0, 0);

    const error = await debitWallet(client, entry({ cents: 300 })).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(InsufficientWalletError);
    expect((error as InsufficientWalletError).userId).toBe('u1');
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it.each([0, -5, 1.5])(
    'refuses an amount of %j cents, and touches nothing',
    async (cents) => {
      const { tx, client } = fakeTransaction();

      await expect(debitWallet(client, entry({ cents }))).rejects.toThrow(
        RangeError,
      );

      expect(tx.user.updateMany).not.toHaveBeenCalled();
    },
  );
});
