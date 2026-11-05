import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { orderNumber } from '../orders/order-number.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  addDays,
  buildPeriods,
  dayKey,
  fromCents,
  makeBalance,
  resolveRange,
  startOfDay,
  STORE_TIME_ZONE,
  sumDollars,
  toCents,
  weekStartOf,
} from './cash-rules.js';
import { CashRangeQueryDto } from './dto/cash-range-query.dto.js';
import { RecordSettlementDto } from './dto/record-settlement.dto.js';

// A cash order that was delivered: its courier collected the total.
// "Cash" is every method that is not the card (the same rule as the web app)
const CASH_DELIVERED = {
  status: 'Delivered',
  paymentMethod: { not: 'card' },
} satisfies Prisma.OrderWhereInput;

const SETTLEMENT_FIELDS = {
  id: true,
  amount: true,
  note: true,
  settledAt: true,
  voidedAt: true,
} as const;

const LEDGER_ORDERS_LIMIT = 300; // the list of orders; the totals always count all of them
const MY_SETTLEMENTS_LIMIT = 10;
const FUTURE_TOLERANCE_MS = 5 * 60_000; // two clocks never agree exactly

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) {}

  // What a courier collected since ever, what he handed over (voided entries do not count), what he owes
  private async balanceOf(partnerId: string) {
    const [collected, settled] = await Promise.all([
      this.prisma.order.aggregate({
        where: { deliveryPartnerId: partnerId, ...CASH_DELIVERED },
        _sum: { total: true },
      }),
      this.prisma.cashSettlement.aggregate({
        where: { partnerId, voidedAt: null },
        _sum: { amount: true },
      }),
    ]);
    return makeBalance(collected._sum.total ?? 0, settled._sum.amount ?? 0);
  }

  private async ensurePartner(partnerId: string) {
    const partner = await this.prisma.deliveryPartner.findUnique({
      where: { id: partnerId },
      select: { id: true, name: true, phone: true, isActive: true },
    });
    if (!partner) throw new NotFoundException('Partner not found');
    return partner;
  }

  // GET /api/admin/cash: every courier, the biggest debt first
  async getOverview() {
    const [partners, collected, settled] = await Promise.all([
      this.prisma.deliveryPartner.findMany({
        select: {
          id: true,
          name: true,
          phone: true,
          vehicleType: true,
          isActive: true,
        },
      }),
      this.prisma.order.groupBy({
        by: ['deliveryPartnerId'],
        where: { deliveryPartnerId: { not: null }, ...CASH_DELIVERED },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.cashSettlement.groupBy({
        by: ['partnerId'],
        where: { voidedAt: null },
        _sum: { amount: true },
        _max: { settledAt: true },
      }),
    ]);

    const collectedBy = new Map(
      collected.map((group) => [group.deliveryPartnerId, group]),
    );
    const settledBy = new Map(settled.map((group) => [group.partnerId, group]));

    const rows = partners.map((partner) => {
      const cash = collectedBy.get(partner.id);
      const handed = settledBy.get(partner.id);
      return {
        ...partner,
        cashOrders: cash?._count._all ?? 0,
        ...makeBalance(cash?._sum.total ?? 0, handed?._sum.amount ?? 0),
        lastSettledAt: handed?._max.settledAt ?? null,
      };
    });
    rows.sort(
      (a, b) =>
        b.owed - a.owed ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );

    return {
      partners: rows,
      totals: makeBalance(
        sumDollars(rows.map((row) => row.collected)),
        sumDollars(rows.map((row) => row.settled)),
      ),
    };
  }

  // GET /api/admin/cash/partners/:partnerId
  async getPartnerLedger(partnerId: string, query: CashRangeQueryDto) {
    const partner = await this.ensurePartner(partnerId);

    const range = resolveRange(query, new Date());
    if (!range.ok) throw new BadRequestException(range.message);

    // From the first moment of the first day to the first moment of the day after the last one
    const start = startOfDay(range.from);
    const end = startOfDay(addDays(range.to, 1));

    const [balance, orders, settlements] = await Promise.all([
      this.balanceOf(partnerId),
      this.prisma.order.findMany({
        where: {
          deliveryPartnerId: partnerId,
          ...CASH_DELIVERED,
          deliveredAt: { gte: start, lt: end },
        },
        select: {
          id: true,
          total: true,
          deliveredAt: true,
          user: { select: { name: true } },
        },
        orderBy: [{ deliveredAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.cashSettlement.findMany({
        where: { partnerId, settledAt: { gte: start, lt: end } },
        orderBy: [{ settledAt: 'desc' }, { id: 'asc' }],
        select: {
          ...SETTLEMENT_FIELDS,
          recordedBy: { select: { name: true } },
        },
      }),
    ]);

    const lines = orders.flatMap((order) =>
      order.deliveredAt
        ? [
            {
              id: order.id,
              total: order.total,
              deliveredAt: order.deliveredAt,
              customer: order.user.name,
            },
          ]
        : [],
    );

    return {
      partner,
      balance, // since ever, not only the period
      range: { from: range.from, to: range.to, timeZone: STORE_TIME_ZONE },
      ...buildPeriods(lines, settlements), // totals, days, weeks (all of the period)
      orders: lines.slice(0, LEDGER_ORDERS_LIMIT).map((line) => ({
        id: line.id,
        number: orderNumber(line.id),
        total: line.total,
        deliveredAt: line.deliveredAt,
        customer: line.customer,
      })),
      ordersTruncated: lines.length > LEDGER_ORDERS_LIMIT,
      settlements: settlements.map((settlement) => ({
        id: settlement.id,
        amount: settlement.amount,
        note: settlement.note,
        settledAt: settlement.settledAt,
        voidedAt: settlement.voidedAt,
        recordedBy: settlement.recordedBy?.name ?? null,
      })),
    };
  }

  // POST /api/admin/cash/partners/:partnerId/settlements
  async recordSettlement(
    adminId: string,
    partnerId: string,
    dto: RecordSettlementDto,
  ) {
    await this.ensurePartner(partnerId);

    const now = new Date();
    const settledAt = dto.settledAt ?? now;
    if (settledAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      throw new BadRequestException('The date cannot be in the future');
    }

    // A courier cannot hand over more than he owes: this catches a typo (an extra zero).
    // Checked right before saving; two admins recording at the very same moment could both pass
    const owedCents = toCents((await this.balanceOf(partnerId)).owed);
    const amountCents = toCents(dto.amount);
    if (owedCents <= 0)
      throw new BadRequestException('This courier owes nothing right now');
    if (amountCents > owedCents) {
      throw new BadRequestException(
        `This courier owes ${dollars(owedCents)}. You cannot record more than that`,
      );
    }

    const settlement = await this.prisma.cashSettlement.create({
      data: {
        partnerId,
        amount: fromCents(amountCents),
        note: dto.note?.trim() || null,
        settledAt,
        recordedById: adminId,
      },
      select: SETTLEMENT_FIELDS,
    });

    return { settlement, balance: await this.balanceOf(partnerId) };
  }

  // PUT /api/admin/cash/settlements/:id/void: cancels a wrong entry. Safe to repeat
  async voidSettlement(id: string) {
    const settlement = await this.prisma.cashSettlement.findUnique({
      where: { id },
      select: { id: true, voidedAt: true },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');

    if (!settlement.voidedAt) {
      // voidedAt: null is part of the condition: the first cancellation wins
      await this.prisma.cashSettlement.updateMany({
        where: { id, voidedAt: null },
        data: { voidedAt: new Date() },
      });
    }
    return { message: 'Settlement cancelled' };
  }

  // GET /api/delivery/my-cash: what the courier sees about his own cash
  async getMyCash(partnerId: string) {
    const today = dayKey(new Date());
    const weekStart = weekStartOf(today);

    const [balance, recent, settlements] = await Promise.all([
      this.balanceOf(partnerId),
      this.prisma.order.findMany({
        where: {
          deliveryPartnerId: partnerId,
          ...CASH_DELIVERED,
          deliveredAt: { gte: startOfDay(weekStart) },
        },
        select: { total: true, deliveredAt: true },
      }),
      this.prisma.cashSettlement.findMany({
        where: { partnerId, voidedAt: null },
        orderBy: [{ settledAt: 'desc' }, { id: 'asc' }],
        take: MY_SETTLEMENTS_LIMIT,
        select: { id: true, amount: true, note: true, settledAt: true },
      }),
    ]);

    const lines = recent.flatMap((order) =>
      order.deliveredAt
        ? [{ total: order.total, deliveredAt: order.deliveredAt }]
        : [],
    );
    const todayLines = lines.filter(
      (line) => dayKey(line.deliveredAt) === today,
    );

    return {
      balance,
      today: {
        orders: todayLines.length,
        collected: sumDollars(todayLines.map((line) => line.total)),
      },
      week: {
        weekStart,
        orders: lines.length,
        collected: sumDollars(lines.map((line) => line.total)),
      },
      settlements,
    };
  }
}
