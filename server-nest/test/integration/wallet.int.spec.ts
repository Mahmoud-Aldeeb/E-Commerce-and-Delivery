import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  creditWallet,
  debitWallet,
  InsufficientWalletError,
} from '../../src/wallet/wallet.ledger.js';
import { makeUser } from './factories.js';
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
  await makeUser(db.prisma, 'u1', { walletBalanceCents: 1000 }); // $10.00
});

const balanceOf = async () =>
  (
    await db.prisma.user.findUniqueOrThrow({
      where: { id: 'u1' },
      select: { walletBalanceCents: true },
    })
  ).walletBalanceCents;

// Every call is its own transaction on its own connection, so they really run at the same time
const credit = (cents: number, reference: string) =>
  db.prisma.$transaction((tx) =>
    creditWallet(tx, { userId: 'u1', cents, type: 'RETURN_REFUND', reference }),
  );
const debit = (cents: number, reference: string) =>
  db.prisma.$transaction((tx) =>
    debitWallet(tx, { userId: 'u1', cents, type: 'ORDER_PAYMENT', reference }),
  );

describe('the wallet on a real database', () => {
  it('twelve orders of $3 on a wallet of $10 at the same moment: exactly three get the money, and the ledger agrees', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) => debit(300, `order:o${index}`)),
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(3);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(InsufficientWalletError);
    }

    expect(await balanceOf()).toBe(100);
    const rows = await db.prisma.walletTransaction.findMany();
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.amountCents === -300)).toBe(true);
  });

  it('a second credit with the same reference changes nothing: its whole transaction fails', async () => {
    await credit(500, 'return:r1');

    const error = await credit(500, 'return:r1').catch(
      (caught: unknown) => caught,
    );

    expect(error).toHaveProperty('code', 'P2002');
    expect(await balanceOf()).toBe(1500);
    expect(await db.prisma.walletTransaction.count()).toBe(1);
  });

  it('the database itself refuses a negative balance, whatever the code does', async () => {
    await expect(
      db.prisma
        .$executeRaw`UPDATE "User" SET "walletBalanceCents" = -1 WHERE id = ${'u1'}`,
    ).rejects.toThrow();

    expect(await balanceOf()).toBe(1000);
  });

  it('credits and debits at the same moment keep the balance and the ledger equal, and never below zero', async () => {
    const credits = Array.from({ length: 6 }, (_, index) =>
      credit(200, `return:c${index}`),
    );
    const debits = Array.from({ length: 6 }, (_, index) =>
      debit(300, `order:d${index}`),
    );

    const results = await Promise.allSettled([...credits, ...debits]);

    // Every credit goes through. A debit that came when the balance was short is refused, and only that
    expect(
      results.slice(0, 6).every((result) => result.status === 'fulfilled'),
    ).toBe(true);
    const debitResults = results.slice(6);
    for (const result of debitResults) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(InsufficientWalletError);
      }
    }
    const paid = debitResults.filter(
      (result) => result.status === 'fulfilled',
    ).length;

    const rows = await db.prisma.walletTransaction.findMany();
    const sum = rows.reduce((total, row) => total + row.amountCents, 0);

    expect(rows).toHaveLength(6 + paid);
    expect(await balanceOf()).toBe(1000 + 1200 - 300 * paid);
    expect(await balanceOf()).toBe(1000 + sum);
    expect(rows.every((row) => row.balanceAfterCents >= 0)).toBe(true);
  });
});
