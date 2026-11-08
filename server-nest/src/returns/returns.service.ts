import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeService } from '../stripe/stripe.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { appendStatusHistory } from '../common/utils/status-history.util.js';
import { pageArgs, pageInfo } from '../common/utils/pagination.util.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { restoreStock } from '../orders/stock.util.js';
import { roundToCents } from '../orders/order-pricing.js';
import { CreateReturnDto } from './dto/create-return.dto.js';
import {
  ApproveReturnDto,
  CompleteReturnDto,
  RejectReturnDto,
} from './dto/return-actions.dto.js';
import { GetAdminReturnsQueryDto } from './dto/get-admin-returns-query.dto.js';
import {
  ACTIVE_RETURN_STATUSES,
  availableLines,
  calculateReturnRefund,
  canMove,
  checkEligibility,
  cleanReturnSearch,
  parseLines,
  planReturn,
  refundStatusOf,
  RETURN_REASON_LABELS,
  RETURN_WINDOW_DAYS,
  type ReturnStatus,
} from './return-rules.js';
import {
  RETURN_TAB_FILTERS,
  RETURN_TABS,
  type ReturnTab,
} from './return-tabs.js';

// What the admin sees with a return: its order (the money) and its customer
const ADMIN_INCLUDE = {
  order: {
    select: {
      id: true,
      paymentMethod: true,
      total: true,
      deliveredAt: true,
      createdAt: true,
    },
  },
  user: { select: { name: true, email: true, phone: true } },
} as const satisfies Prisma.ReturnRequestInclude;

// The Stripe id of a refund is for the store: the customer never sees it
const CUSTOMER_OMIT = {
  refundId: true,
} as const satisfies Prisma.ReturnRequestOmit;

const ORDER_FOR_RETURN = {
  id: true,
  status: true,
  deliveredAt: true,
  items: true,
  subtotal: true,
  total: true,
  deliveryFee: true,
} as const satisfies Prisma.OrderSelect;

const cleanNote = (value: string | undefined) => (value ?? '').trim();

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
  ) {}

  // ---------- The customer ----------

  // GET /api/orders/:orderId/returns: can this order be returned, what is left to return, and its returns
  async getOrderReturns(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: ORDER_FOR_RETURN,
    });
    if (!order) throw new NotFoundException('Order not found');

    const returnRequests = await this.prisma.returnRequest.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      omit: CUSTOMER_OMIT,
    });

    const active = returnRequests
      .filter((request) => ACTIVE_RETURN_STATUSES.includes(request.status))
      .map((request) => request.items);

    return {
      eligibility: checkEligibility(order, new Date()),
      windowDays: RETURN_WINDOW_DAYS,
      lines: availableLines(parseLines(order.items), active),
      returnRequests,
    };
  }

  // GET /api/returns
  async getMyReturns(userId: string, query: PaginationQueryDto) {
    const { limit, page = 1 } = query;
    const where: Prisma.ReturnRequestWhereInput = { userId };

    const [returnRequests, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        omit: CUSTOMER_OMIT,
        ...pageArgs(limit, page),
      }),
      this.prisma.returnRequest.count({ where }),
    ]);

    return { returnRequests, ...pageInfo(total, page, limit) };
  }

  // POST /api/orders/:orderId/returns
  async createReturn(userId: string, orderId: string, dto: CreateReturnDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      // The order is locked until this transaction ends: two requests for the same order take turns,
      // so the second one sees the units the first one took. The owner is part of the query:
      // another customer's order looks like "not found"
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order" WHERE id = ${orderId} AND "userId" = ${userId} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('Order not found');

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: ORDER_FOR_RETURN,
      });

      const eligibility = checkEligibility(order, new Date());
      if (!eligibility.eligible)
        throw new BadRequestException(eligibility.message);

      // Rejected and cancelled returns hold nothing: their units and their money are free again
      const earlier = await tx.returnRequest.findMany({
        where: { orderId, status: { in: ACTIVE_RETURN_STATUSES } },
        select: { items: true, refundAmount: true },
      });

      const plan = planReturn(
        parseLines(order.items),
        earlier.map((request) => request.items),
        dto.items,
      );
      if (!plan.ok) throw new BadRequestException(plan.message);

      const refundAmount = calculateReturnRefund({
        orderSubtotal: order.subtotal,
        orderTotal: order.total,
        orderDeliveryFee: order.deliveryFee,
        itemsValue: plan.itemsValue,
        reserved: roundToCents(
          earlier.reduce((sum, request) => sum + request.refundAmount, 0),
        ),
        completesOrder: plan.completesOrder,
      });

      return tx.returnRequest.create({
        data: {
          orderId,
          userId,
          items: plan.lines,
          reason: dto.reason,
          comment: dto.comment?.trim() || null,
          refundAmount,
          statusHistory: [
            {
              status: 'Requested',
              note: `Return requested: ${RETURN_REASON_LABELS[dto.reason]}`,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        omit: CUSTOMER_OMIT,
      });
    });

    return { returnRequest: created };
  }

  // POST /api/returns/:id/cancel: only while the store has not answered
  async cancelMyReturn(userId: string, id: string) {
    const row = await this.prisma.returnRequest.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Return not found');
    if (!canMove(row.status, 'CANCELLED')) {
      throw new BadRequestException(
        'A return can only be cancelled while it is waiting for the store',
      );
    }

    await this.move(
      this.prisma,
      row,
      'CANCELLED',
      'Cancelled',
      'Cancelled by the customer',
    );

    const returnRequest = await this.prisma.returnRequest.findUniqueOrThrow({
      where: { id },
      omit: CUSTOMER_OMIT,
    });
    return { returnRequest };
  }

  // ---------- The admin ----------

  // GET /api/admin/returns
  async getAdminReturns(query: GetAdminReturnsQueryDto) {
    const { limit, page = 1, tab = 'all' } = query;

    const term = cleanReturnSearch(query.search);
    const searchFilter: Prisma.ReturnRequestWhereInput = term
      ? {
          OR: [
            { id: { contains: term, mode: 'insensitive' } },
            { orderId: { contains: term, mode: 'insensitive' } },
            { user: { name: { contains: term, mode: 'insensitive' } } },
            { user: { email: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {};
    const where: Prisma.ReturnRequestWhereInput = {
      AND: [RETURN_TAB_FILTERS[tab], searchFilter],
    };

    const [returnRequests, total, counts] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        include: ADMIN_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
      }),
      this.prisma.returnRequest.count({ where }),
      this.countTabs(),
    ]);

    return { returnRequests, ...pageInfo(total, page, limit), counts };
  }

  // One count per tab. They ignore the search text, so the numbers on the tabs stay steady
  private async countTabs(): Promise<Record<ReturnTab, number>> {
    const entries = await Promise.all(
      RETURN_TABS.map(
        async (key) =>
          [
            key,
            await this.prisma.returnRequest.count({
              where: RETURN_TAB_FILTERS[key],
            }),
          ] as const,
      ),
    );
    return Object.fromEntries(entries) as Record<ReturnTab, number>;
  }

  // POST /api/admin/returns/:id/approve
  async approve(id: string, dto: ApproveReturnDto) {
    const row = await this.findOrFail(id);
    if (!canMove(row.status, 'APPROVED')) {
      throw new BadRequestException('Only a new request can be approved');
    }

    const note = cleanNote(dto.note);
    await this.move(
      this.prisma,
      row,
      'APPROVED',
      'Approved',
      note || 'Approved by the store',
      {
        adminNote: note || null,
      },
    );
    return this.adminView(id);
  }

  // POST /api/admin/returns/:id/reject: a new request, or an approved one whose items did not come back right
  async reject(id: string, dto: RejectReturnDto) {
    const row = await this.findOrFail(id);
    if (!canMove(row.status, 'REJECTED')) {
      throw new BadRequestException('This return can no longer be refused');
    }

    const note = cleanNote(dto.note);
    if (!note) throw new BadRequestException('Say why the return is refused');

    await this.move(this.prisma, row, 'REJECTED', 'Rejected', note, {
      adminNote: note,
    });
    return this.adminView(id);
  }

  // POST /api/admin/returns/:id/complete: the items arrived. The stock and the money are settled
  async complete(id: string, dto: CompleteReturnDto) {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: { select: { paymentMethod: true, paymentIntentId: true } },
      },
    });
    if (!row) throw new NotFoundException('Return not found');
    if (!canMove(row.status, 'COMPLETED')) {
      throw new BadRequestException('Only an approved return can be completed');
    }

    const isCard = row.order.paymentMethod === 'card';
    if (!isCard && dto.cashRefunded !== true) {
      throw new BadRequestException(
        'Confirm that you have given the money back by hand',
      );
    }

    const note = cleanNote(dto.note);

    // 1) The database part: the status and the shelves change together, or nothing changes.
    // The status is part of the condition, so a double click can never restock twice
    await this.prisma.$transaction(async (tx) => {
      await this.move(
        tx,
        row,
        'COMPLETED',
        'Completed',
        note ||
          (dto.restock
            ? 'Completed: the items went back on the shelves'
            : 'Completed: the items did not go back on the shelves'),
        {
          completedAt: new Date(),
          restocked: dto.restock,
          // Cash was given back by hand, right now. A card refund is recorded after Stripe answers
          refundStatus: isCard ? null : 'refunded',
          ...(note ? { adminNote: note } : {}),
        },
      );
      // The same lock order as an order: the variants first, then the products
      if (dto.restock) await restoreStock(tx, row.items);
    });

    // 2) The money part, after the database has committed
    if (isCard) {
      await this.refundCard(
        row.id,
        row.refundAmount,
        row.order.paymentIntentId,
        row.orderId,
      );
    }
    return this.adminView(id);
  }

  // POST /api/admin/returns/:id/refund: try again when the refund failed (or was never recorded)
  async retryRefund(id: string) {
    const row = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: {
        order: { select: { paymentMethod: true, paymentIntentId: true } },
      },
    });
    if (!row) throw new NotFoundException('Return not found');
    if (row.status !== 'COMPLETED') {
      throw new BadRequestException('Only a completed return can be refunded');
    }
    if (row.order.paymentMethod !== 'card') {
      throw new BadRequestException(
        'This return was paid back by hand: there is nothing to retry',
      );
    }
    if (row.refundStatus !== null && row.refundStatus !== 'failed') {
      throw new BadRequestException('This refund does not need another try');
    }

    await this.refundCard(
      row.id,
      row.refundAmount,
      row.order.paymentIntentId,
      row.orderId,
      true,
    );
    return this.adminView(id);
  }

  // ---------- Inside ----------

  private async findOrFail(id: string) {
    const row = await this.prisma.returnRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Return not found');
    return row;
  }

  private async adminView(id: string) {
    const returnRequest = await this.prisma.returnRequest.findUniqueOrThrow({
      where: { id },
      include: ADMIN_INCLUDE,
    });
    return { returnRequest };
  }

  // Changes the status ONLY if it is still the one that was read: if anyone changed the return
  // since, nothing is updated and we stop
  private async move(
    client: Pick<Prisma.TransactionClient, 'returnRequest'>,
    row: { id: string; status: ReturnStatus; statusHistory: Prisma.JsonValue },
    to: ReturnStatus,
    label: string,
    note: string,
    data: Prisma.ReturnRequestUncheckedUpdateManyInput = {},
  ): Promise<void> {
    const { count } = await client.returnRequest.updateMany({
      where: { id: row.id, status: row.status },
      data: {
        ...data,
        status: to,
        statusHistory: appendStatusHistory(row.statusHistory, label, note),
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'The return has just changed. Please try again.',
      );
    }
  }

  // Never throws for a Stripe problem: a failed refund must not undo a return that already happened.
  // It is recorded, and the admin sees it and can retry.
  // `lookFirst`: on a retry, look for a refund of THIS return that already exists. The idempotency key
  // of Stripe is forgotten after 24 hours, and a second partial refund would really be paid
  private async refundCard(
    id: string,
    amount: number,
    paymentIntentId: string | null,
    orderId: string,
    lookFirst = false,
  ): Promise<void> {
    if (amount <= 0) {
      await this.saveRefund(id, null, 'none');
      return;
    }
    if (!paymentIntentId) {
      this.logger.error(
        `Return ${id} was paid by card but its order has no payment id: refund it by hand in Stripe`,
      );
      await this.saveRefund(id, null, 'failed');
      return;
    }

    try {
      if (lookFirst) {
        const { data } = await this.stripe.client.refunds.list({
          payment_intent: paymentIntentId,
          limit: 100,
        });
        const existing = data.find(
          (refund) => refund.metadata?.returnId === id,
        );
        if (existing) {
          await this.saveRefund(
            id,
            existing.id,
            refundStatusOf(existing.status),
          );
          return;
        }
      }

      const refund = await this.stripe.client.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: Math.round(amount * 100),
          reason: 'requested_by_customer',
          metadata: { returnId: id, orderId },
        },
        // The same key always gives the same refund: a double click can never refund twice
        { idempotencyKey: `return-refund-${id}` },
      );
      await this.saveRefund(id, refund.id, refundStatusOf(refund.status));
    } catch (error) {
      this.logger.error(
        `Refund failed for return ${id}: ${(error as Error).message}`,
      );
      await this.saveRefund(id, null, 'failed');
    }
  }

  private saveRefund(id: string, refundId: string | null, status: string) {
    return this.prisma.returnRequest.update({
      where: { id },
      // A failed attempt must not erase the id of an earlier refund
      data: { refundStatus: status, ...(refundId ? { refundId } : {}) },
    });
  }
}
