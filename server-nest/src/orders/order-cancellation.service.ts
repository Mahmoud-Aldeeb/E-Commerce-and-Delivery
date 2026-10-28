import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FINISHED_STATUSES } from '../common/constants/order-status.constants.js';
import { appendStatusHistory } from '../common/utils/status-history.util.js';
import type { Order } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeService } from '../stripe/stripe.service.js';

export type CancelledBy = 'customer' | 'admin' | 'courier';
export type RefundOutcome = 'none' | 'refunded' | 'pending' | 'failed';

interface CancelOptions {
  by: CancelledBy;
  /** Only these statuses can be cancelled. Without it, every unfinished status can */
  allowedStatuses?: string[];
  /** The customer path: another user's order looks like "not found" */
  userId?: string;
  reason?: string;
}

const WHO: Record<CancelledBy, string> = {
  customer: 'Cancelled by the customer',
  admin: 'Cancelled by the store',
  courier: 'Cancelled by the courier',
};

type StoredItem = { product: string; quantity: number };

const toRefundStatus = (
  status: string | null,
): 'refunded' | 'pending' | 'failed' => {
  if (status === 'succeeded') return 'refunded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending'; // "pending", "requires_action"
};

@Injectable()
export class OrderCancellationService {
  private readonly logger = new Logger(OrderCancellationService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
  ) {}

  async cancel(
    orderId: string,
    { by, allowedStatuses, userId, reason }: CancelOptions,
  ) {
    const note = reason?.trim() ? `${WHO[by]}: ${reason.trim()}` : WHO[by];

    // 1) The database part: everything succeeds together, or nothing changes
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, ...(userId ? { userId } : {}) },
      });
      if (!order) throw new NotFoundException('Order not found');

      if (FINISHED_STATUSES.includes(order.status)) {
        throw new BadRequestException('This order is already finished');
      }
      if (allowedStatuses && !allowedStatuses.includes(order.status)) {
        throw new BadRequestException('This order can no longer be cancelled');
      }
      // A card order that is not paid yet has taken no stock and holds no money
      if (order.paymentMethod === 'card' && !order.isPaid) {
        throw new BadRequestException('This order is waiting for payment');
      }

      // The current status is part of the condition: if anyone changed the order
      // since it was read above, nothing is updated and we stop
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: order.status },
        data: {
          status: 'Cancelled',
          statusHistory: appendStatusHistory(
            order.statusHistory,
            'Cancelled',
            note,
          ),
          deliveryOtp: '', // the delivery code is useless now
        },
      });
      if (count === 0) {
        throw new ConflictException(
          'The order has just changed. Please try again.',
        );
      }

      // Put the items back on the shelves (updateMany: a missing product does not abort)
      const items = Array.isArray(order.items)
        ? (order.items as unknown as StoredItem[])
        : [];
      for (const item of items) {
        await tx.product.updateMany({
          where: { id: item.product },
          data: { stock: { increment: item.quantity } },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: order.id } });
    });

    // 2) The money part, after the database has committed
    return this.refund(cancelled);
  }

  // Used by the Stripe webhook: the payment arrived, but the item sold out in the meantime
  async cancelOutOfStock(orderId: string, paymentIntentId: string) {
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return null;

      // isPaid: false in the condition: a duplicate webhook event finds nothing to do
      const { count } = await tx.order.updateMany({
        where: { id: order.id, isPaid: false },
        data: {
          isPaid: true,
          paymentIntentId,
          status: 'Cancelled',
          deliveryOtp: '',
          statusHistory: appendStatusHistory(
            order.statusHistory,
            'Cancelled',
            'Cancelled automatically: an item sold out before the payment arrived',
          ),
        },
      });
      if (count === 0) return null;

      // The stock was never taken for this order, so nothing goes back to the shelves
      return tx.order.findUniqueOrThrow({ where: { id: order.id } });
    });

    if (!cancelled) return;

    this.logger.warn(
      `Order ${orderId} was paid but sold out: it was cancelled and the refund started`,
    );
    return this.refund(cancelled);
  }

  // Used by the admin when a refund failed (or was never recorded)
  async retryRefund(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'Cancelled') {
      throw new BadRequestException('Only cancelled orders can be refunded');
    }
    return this.refund(order);
  }

  // Never throws: a failed refund must not undo a cancellation that already happened.
  // It is recorded on the order, and the admin sees it and can retry.
  private async refund(
    order: Order,
  ): Promise<{ order: Order; outcome: RefundOutcome }> {
    if (order.paymentMethod !== 'card' || !order.isPaid)
      return { order, outcome: 'none' };
    if (order.refundStatus === 'refunded')
      return { order, outcome: 'refunded' };

    if (!order.paymentIntentId) {
      this.logger.error(
        `Order ${order.id} was paid by card but has no payment id: refund it by hand in Stripe`,
      );
      return {
        order: await this.saveRefund(order.id, null, 'failed'),
        outcome: 'failed',
      };
    }

    try {
      const refund = await this.stripe.client.refunds.create(
        {
          payment_intent: order.paymentIntentId,
          reason: 'requested_by_customer',
          metadata: { orderId: order.id },
        },
        // The same key always gives the same refund: a retry can never refund twice
        { idempotencyKey: `refund-${order.id}` },
      );

      const status = toRefundStatus(refund.status);
      return {
        order: await this.saveRefund(order.id, refund.id, status),
        outcome: status,
      };
    } catch (error) {
      this.logger.error(
        `Refund failed for order ${order.id}: ${(error as Error).message}`,
      );
      return {
        order: await this.saveRefund(order.id, null, 'failed'),
        outcome: 'failed',
      };
    }
  }

  private saveRefund(orderId: string, refundId: string | null, status: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      // A failed attempt must not erase the id of an earlier refund
      data: { refundStatus: status, ...(refundId ? { refundId } : {}) },
    });
  }
}
