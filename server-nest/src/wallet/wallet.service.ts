import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { pageArgs, pageInfo } from '../common/utils/pagination.util.js';
import { toDollars } from './wallet-rules.js';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  // GET /api/wallet: the balance and its history, newest first. The API speaks dollars
  async getWallet(userId: string, query: PaginationQueryDto) {
    const { limit, page = 1 } = query;

    const [user, rows, total] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { walletBalanceCents: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
      }),
      this.prisma.walletTransaction.count({ where: { userId } }),
    ]);

    return {
      balance: toDollars(user.walletBalanceCents),
      transactions: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: toDollars(row.amountCents),
        balanceAfter: toDollars(row.balanceAfterCents),
        orderId: row.orderId,
        returnId: row.returnId,
        createdAt: row.createdAt,
      })),
      ...pageInfo(total, page, limit),
    };
  }
}
