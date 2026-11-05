import { Injectable } from '@nestjs/common';
import {
  addDays,
  dayKey,
  fromCents,
  startOfDay,
  STORE_TIME_ZONE,
  sumDollars,
  toCents,
} from '../cash/cash-rules.js';
import type { Prisma } from '../generated/prisma/client.js';
import { orderNumber } from '../orders/order-number.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildDailySales,
  isAutoCancelled,
  paceDaysLeft,
  percentChange,
  rankCancelledProducts,
  refundKind,
  sortLowStock,
  summarizeDays,
  topSellers,
  totalsByProduct,
} from './analytics-rules.js';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';

const DEFAULT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// The most orders one report reads. Above it the report says it is partial (`truncated`)
const MAX_SALES_ORDERS = 8000;
const MAX_CANCELLED_ORDERS = 3000;

const BEST_SELLERS_LIMIT = 10;
const CANCELLED_LIST_LIMIT = 8;
const LOW_STOCK_LIST_LIMIT = 15;
const LOW_STOCK_FETCH_LIMIT = 100;
const REFUND_ROWS_LIMIT = 20;

// The same number as the low stock email (inngest.functions.ts)
const LOW_STOCK_THRESHOLD = 10;
// A refund that is still "pending" after this long is worth a look in Stripe
const STALE_PENDING_DAYS = 7;

// Orders that count as sales: not cancelled, and a card order only once it is paid.
// The same rule as HIDE_UNPAID_CARD_ORDERS in the orders service
const SALES = {
  status: { not: 'Cancelled' },
  NOT: [{ paymentMethod: 'card', isPaid: false }],
} satisfies Prisma.OrderWhereInput;

const cents = (dollars: number | null) => fromCents(toCents(dollars ?? 0));

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // GET /api/admin/analytics?days=30
  async getAnalytics({ days = DEFAULT_DAYS }: AnalyticsQueryDto) {
    const now = new Date();

    // The period: the last `days` calendar days of the store, today included
    const to = dayKey(now);
    const from = addDays(to, -(days - 1));
    const start = startOfDay(from);
    const end = startOfDay(addDays(to, 1));
    const previousStart = startOfDay(addDays(from, -days));
    const placedInPeriod = { createdAt: { gte: start, lt: end } };

    // A cancelled card order that was paid, and whose money is not back (or nobody knows)
    const refundProblems = {
      status: 'Cancelled',
      paymentMethod: 'card',
      isPaid: true,
      OR: [
        { refundStatus: null },
        { refundStatus: 'failed' },
        {
          refundStatus: 'pending',
          updatedAt: {
            lt: new Date(now.getTime() - STALE_PENDING_DAYS * DAY_MS),
          },
        },
      ],
    } satisfies Prisma.OrderWhereInput;

    const [
      salesRows,
      previous,
      cancelledCount,
      cancelledRows,
      refundGroups,
      refundRows,
      lowStockRows,
      lowCount,
      outCount,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { ...SALES, ...placedInPeriod },
        select: { createdAt: true, total: true, discount: true, items: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: MAX_SALES_ORDERS + 1, // one more than the limit: it tells there is more
      }),
      this.prisma.order.aggregate({
        where: { ...SALES, createdAt: { gte: previousStart, lt: start } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.count({
        where: { status: 'Cancelled', ...placedInPeriod },
      }),
      this.prisma.order.findMany({
        where: { status: 'Cancelled', ...placedInPeriod },
        select: { items: true, statusHistory: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: MAX_CANCELLED_ORDERS + 1,
      }),
      this.prisma.order.groupBy({
        by: ['refundStatus'],
        where: refundProblems,
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.findMany({
        where: refundProblems,
        select: {
          id: true,
          total: true,
          refundStatus: true,
          paymentIntentId: true,
          updatedAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], // the oldest problem first
        take: REFUND_ROWS_LIMIT,
      }),
      this.prisma.product.findMany({
        where: { stock: { lte: LOW_STOCK_THRESHOLD } },
        select: { id: true, name: true, image: true, stock: true },
        orderBy: [{ stock: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        take: LOW_STOCK_FETCH_LIMIT,
      }),
      this.prisma.product.count({
        where: { stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
      }),
      this.prisma.product.count({ where: { stock: 0 } }),
    ]);

    const truncated =
      salesRows.length > MAX_SALES_ORDERS ||
      cancelledRows.length > MAX_CANCELLED_ORDERS;
    const sales = salesRows.slice(0, MAX_SALES_ORDERS);
    // An order the system cancelled because an item sold out says nothing about the product
    const cancelled = cancelledRows
      .slice(0, MAX_CANCELLED_ORDERS)
      .filter((row) => !isAutoCancelled(row.statusHistory));

    const daily = buildDailySales(sales, from, to);
    const summary = summarizeDays(daily);
    const soldTotals = totalsByProduct(sales);
    const bestSellers = topSellers(soldTotals, BEST_SELLERS_LIMIT);
    const cancelledProducts = rankCancelledProducts(
      totalsByProduct(cancelled),
      soldTotals,
      CANCELLED_LIST_LIMIT,
    );

    // The stock of the best sellers TODAY (an order only remembers the day it was placed)
    const stockRows =
      bestSellers.length === 0
        ? []
        : await this.prisma.product.findMany({
            where: {
              id: { in: bestSellers.map((seller) => seller.productId) },
            },
            select: { id: true, stock: true },
          });
    const stockOf = new Map(stockRows.map((row) => [row.id, row.stock]));

    const previousOrders = previous._count._all;
    const previousRevenue = cents(previous._sum.total);
    const placed = summary.orders + cancelledCount;

    const lowStock = sortLowStock(
      lowStockRows.map((row) => {
        const stock = row.stock ?? 0;
        const soldInPeriod = soldTotals.get(row.id)?.units ?? 0;
        return {
          id: row.id,
          name: row.name,
          image: row.image,
          stock,
          soldInPeriod,
          daysLeft: paceDaysLeft(stock, soldInPeriod, days),
        };
      }),
    ).slice(0, LOW_STOCK_LIST_LIMIT);

    const tally = (groups: typeof refundGroups) => ({
      count: groups.reduce((sum, group) => sum + group._count._all, 0),
      amount: sumDollars(groups.map((group) => group._sum.total ?? 0)),
    });

    return {
      range: { from, to, days, timeZone: STORE_TIME_ZONE },
      truncated,
      summary: {
        ...summary,
        cancelledOrders: cancelledCount,
        cancelRate:
          placed === 0 ? 0 : Math.round((cancelledCount / placed) * 100),
      },
      previous: { orders: previousOrders, revenue: previousRevenue },
      change: {
        orders: percentChange(summary.orders, previousOrders),
        revenue: percentChange(summary.revenue, previousRevenue),
      },
      days: daily,
      bestSellers: bestSellers.map((seller) => ({
        ...seller,
        stock: stockOf.get(seller.productId) ?? null,
      })),
      cancelledProducts,
      lowStock: {
        counts: { low: lowCount, out: outCount },
        products: lowStock,
      },
      refunds: {
        needsAction: tally(
          refundGroups.filter(
            (group) =>
              group.refundStatus === null || group.refundStatus === 'failed',
          ),
        ),
        stalePending: tally(
          refundGroups.filter((group) => group.refundStatus === 'pending'),
        ),
        staleAfterDays: STALE_PENDING_DAYS,
        items: refundRows.map((row) => ({
          id: row.id,
          number: orderNumber(row.id),
          customer: row.user.name,
          email: row.user.email,
          total: row.total,
          kind: refundKind(row.refundStatus),
          since: row.updatedAt,
          paymentIntentId: row.paymentIntentId,
        })),
      },
    };
  }
}
