import { describe, expect, it, vi } from 'vitest';
import { WalletService } from './wallet.service.js';

// The service imports it only so Nest can inject it: the tests hand it a fake instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

function setup() {
  const prisma = {
    user: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ walletBalanceCents: 1278 }),
    },
    walletTransaction: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return { service: new WalletService(prisma as never), prisma };
}

describe('getWallet', () => {
  it('gives the balance and the history in dollars, newest first', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date('2026-11-08T10:00:00.000Z');
    prisma.walletTransaction.findMany.mockResolvedValue([
      {
        id: 't2',
        userId: 'u1',
        type: 'ORDER_PAYMENT',
        amountCents: -500,
        balanceAfterCents: 1278,
        reference: 'order:o1',
        orderId: 'o1',
        returnId: null,
        createdAt,
      },
    ]);
    prisma.walletTransaction.count.mockResolvedValue(1);

    const result = await service.getWallet('u1', {} as never);

    expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(result.balance).toBe(12.78);
    expect(result.transactions).toEqual([
      {
        id: 't2',
        type: 'ORDER_PAYMENT',
        amount: -5,
        balanceAfter: 12.78,
        orderId: 'o1',
        returnId: null,
        createdAt,
      },
    ]);
  });

  it('pages the history', async () => {
    const { service, prisma } = setup();
    prisma.walletTransaction.count.mockResolvedValue(12);

    const result = await service.getWallet('u1', {
      limit: 5,
      page: 3,
    } as never);

    expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 10 }),
    );
    expect(result).toMatchObject({ total: 12, page: 3, pages: 3 });
  });
});
