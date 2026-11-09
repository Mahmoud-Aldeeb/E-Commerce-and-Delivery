import type { Prisma } from '../generated/prisma/client.js';

export type WalletEntryType =
  'RETURN_REFUND' | 'ORDER_PAYMENT' | 'ORDER_REFUND';

export interface WalletEntry {
  userId: string;
  /** A positive whole number of cents: the direction comes from the function you call */
  cents: number;
  type: WalletEntryType;
  /** One real event, one reference ("return:<id>", "order:<id>"...). It is unique in the database */
  reference: string;
  orderId?: string;
  returnId?: string;
}

export class InsufficientWalletError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super('Not enough balance in the wallet');
    this.name = 'InsufficientWalletError';
    this.userId = userId;
  }
}

// A wrong amount is a bug of the caller, not a request of a customer: fail loudly
function assertCents(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new RangeError(
      `A wallet amount must be a positive whole number of cents, got ${cents}`,
    );
  }
}

// Both functions run INSIDE the transaction that makes the money move (an order, a completed return):
// the wallet and the thing that moved it succeed or fail together. They touch the user row LAST, after
// the products: the same lock order everywhere, so two transactions never wait for each other

// Adds money. Gives back the new balance in cents.
// The unique `reference` makes the same event unable to credit twice: the second try fails and takes
// its whole transaction with it
export async function creditWallet(
  tx: Prisma.TransactionClient,
  entry: WalletEntry,
): Promise<number> {
  assertCents(entry.cents);

  const { walletBalanceCents } = await tx.user.update({
    where: { id: entry.userId },
    data: { walletBalanceCents: { increment: entry.cents } },
    select: { walletBalanceCents: true },
  });

  await tx.walletTransaction.create({
    data: {
      userId: entry.userId,
      type: entry.type,
      amountCents: entry.cents,
      balanceAfterCents: walletBalanceCents,
      reference: entry.reference,
      orderId: entry.orderId ?? null,
      returnId: entry.returnId ?? null,
    },
  });
  return walletBalanceCents;
}

// Takes money. The balance is part of the condition of the SAME statement that subtracts, so two
// orders can never spend the same dollar. Gives back the new balance in cents
export async function debitWallet(
  tx: Prisma.TransactionClient,
  entry: WalletEntry,
): Promise<number> {
  assertCents(entry.cents);

  const { count } = await tx.user.updateMany({
    where: { id: entry.userId, walletBalanceCents: { gte: entry.cents } },
    data: { walletBalanceCents: { decrement: entry.cents } },
  });
  if (count === 0) throw new InsufficientWalletError(entry.userId);

  // The row is locked by the update above until this transaction ends: nobody changed it since
  const { walletBalanceCents } = await tx.user.findUniqueOrThrow({
    where: { id: entry.userId },
    select: { walletBalanceCents: true },
  });

  await tx.walletTransaction.create({
    data: {
      userId: entry.userId,
      type: entry.type,
      amountCents: -entry.cents,
      balanceAfterCents: walletBalanceCents,
      reference: entry.reference,
      orderId: entry.orderId ?? null,
      returnId: entry.returnId ?? null,
    },
  });
  return walletBalanceCents;
}
