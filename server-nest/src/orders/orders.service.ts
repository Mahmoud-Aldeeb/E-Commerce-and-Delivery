import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { StripeService } from '../stripe/stripe.service.js';
import { InngestService } from '../inngest/inngest.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { FINISHED_STATUSES } from '../common/constants/order-status.constants.js';
import { CancelOrderDto } from './dto/cancel-order.dto.js';
import { OrderCancellationService } from './order-cancellation.service.js';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  omitPrivateOrderFields,
  PRIVATE_ORDER_FIELDS,
} from './order-rules.js';
import type { Order } from '../generated/prisma/client.js';
import { InsufficientStockError, takeStock } from './stock.util.js';
import { pageArgs, pageInfo } from '../common/utils/pagination.util.js';
import {
  ADMIN_ORDER_TABS,
  ADMIN_TAB_FILTERS,
  type AdminOrderTab,
} from './admin-order-tabs.js';
import { GetAllOrdersQueryDto } from './dto/get-all-orders-query.dto.js';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto.js';
import { calculateTotals } from './order-pricing.js';

// Card orders stay hidden until Stripe confirms the payment
export const HIDE_UNPAID_CARD_ORDERS: Prisma.OrderWhereInput = {
  NOT: [{ paymentMethod: 'card', isPaid: false }],
};

// "all" (or nothing) = no filter, "active" = not finished,
// "delivered" and "cancelled" = that status, anything else = that exact status
function statusFilter(status?: string): Prisma.OrderWhereInput {
  if (!status || status === 'all') return {};
  if (status === 'active') return { status: { notIn: FINISHED_STATUSES } };
  if (status === 'delivered') return { status: 'Delivered' };
  if (status === 'cancelled') return { status: 'Cancelled' };
  return { status };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private inngest: InngestService,
    private cancellation: OrderCancellationService,
  ) {}

  // Background events must never make an already-created order fail
  private async emitEvents(events: Parameters<InngestService['send']>[0]) {
    try {
      await this.inngest.send(events);
    } catch (error) {
      this.logger.error('Failed to send Inngest events', error as Error);
    }
  }

  // POST /api/orders
  async createOrder(userId: string, dto: CreateOrderDto, origin?: string) {
    const { items, shippingAddress, paymentMethod } = dto;

    // The courier calls the customer: no phone number, no order
    const customer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!customer?.phone) {
      throw new BadRequestException(
        'Add a phone number so the courier can reach you',
      );
    }

    // Prices always come from the database, never from the client
    const products = await this.prisma.product.findMany({
      where: { id: { in: items.map((item) => item.product) } },
    });
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    // A first check, only to give a clear message. takeStock below is the real protection
    for (const item of items) {
      const product = productMap.get(item.product);
      if (!product) {
        throw new NotFoundException(
          'A product in your cart is no longer available',
        );
      }

      const available = product.stock ?? 0;
      if (available < item.quantity) {
        throw new ConflictException(
          available > 0
            ? `Only ${available} left of "${product.name}"`
            : `"${product.name}" is out of stock`,
        );
      }
    }

    const orderItems = items.map((item) => {
      const product = productMap.get(item.product)!; // existence checked above
      return {
        product: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity: item.quantity,
      };
    });

    // The prices, the fees and the rounding live in order-pricing.ts (and are tested there)
    const { subtotal, deliveryFee, tax, total } = calculateTotals(
      orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    );

    const isCard = paymentMethod === 'card';

    let order: Order;
    try {
      // The order and (for cash) its stock are saved together: both happen, or neither
      order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            userId,
            items: orderItems,
            shippingAddress: { ...shippingAddress },
            paymentMethod,
            subtotal,
            deliveryFee,
            tax,
            total,
            statusHistory: [
              {
                status: 'Placed',
                note: 'Order placed successfully',
                timestamp: new Date().toISOString(),
              },
            ],
          },
        });

        // Cash orders take their stock now. Card orders take it when Stripe confirms the payment
        if (!isCard) await takeStock(tx, orderItems);

        return created;
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        const name =
          productMap.get(error.productId)?.name ?? 'A product in your cart';
        throw new ConflictException(`"${name}" was just sold out`);
      }
      throw error;
    }

    if (isCard) {
      const session = await this.stripe.client.checkout.sessions.create({
        success_url: `${origin}/orders/${order.id}?clearCart=true`,
        cancel_url: `${origin}/checkout`,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Order payment' },
              unit_amount: Math.round(total * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        metadata: { orderId: order.id },
      });

      return { url: session.url };
    }

    await this.emitEvents([
      ...orderItems.map((item) => ({
        name: 'inventory/stock.updated',
        data: { productId: item.product },
      })),
      { name: 'order/placed', data: { orderId: order.id } },
    ]);

    return { order: omitPrivateOrderFields(order) };
  }

  // GET /api/orders
  async getUserOrders(userId: string, query: GetOrdersQueryDto) {
    const { limit, page = 1 } = query;

    // The customer's visible orders. The tab counts are always taken from this
    const base: Prisma.OrderWhereInput = {
      AND: [{ userId }, HIDE_UNPAID_CARD_ORDERS],
    };
    const where: Prisma.OrderWhereInput = {
      AND: [base, statusFilter(query.status)],
    };

    // The page, its total and the tab counts are read at the same time
    const [orders, total, grouped] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { deliveryPartner: { select: { name: true, phone: true } } },
        omit: PRIVATE_ORDER_FIELDS,
        // The id breaks ties, so an order never shows on two pages (or on none)
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
    ]);

    const counts = { all: 0, active: 0, delivered: 0, cancelled: 0 };
    for (const group of grouped) {
      const amount = group._count._all;
      counts.all += amount;
      if (group.status === 'Delivered') counts.delivered += amount;
      else if (group.status === 'Cancelled') counts.cancelled += amount;
      else counts.active += amount;
    }

    return { orders, ...pageInfo(total, page, limit), counts };
  }

  // GET /api/orders/all (admin)
  async getAllOrders(query: GetAllOrdersQueryDto) {
    const { limit, page = 1, tab = 'all' } = query;

    // "#A1B2C3D4" and "a1b2c3d4" find the same order
    const term = query.search?.trim().replace(/^#/, '');
    const searchFilter: Prisma.OrderWhereInput = term
      ? {
          OR: [
            { id: { contains: term, mode: 'insensitive' } },
            { user: { name: { contains: term, mode: 'insensitive' } } },
            { user: { email: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {};

    const where: Prisma.OrderWhereInput = {
      AND: [HIDE_UNPAID_CARD_ORDERS, ADMIN_TAB_FILTERS[tab], searchFilter],
    };

    const [orders, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { name: true, email: true } },
          deliveryPartner: { select: { name: true, phone: true, email: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
      }),
      this.prisma.order.count({ where }),
      this.countAdminTabs(),
    ]);

    return { orders, ...pageInfo(total, page, limit), counts };
  }

  // One count per tab. They ignore the search text, so the numbers on the tabs stay steady
  private async countAdminTabs(): Promise<Record<AdminOrderTab, number>> {
    const entries = await Promise.all(
      ADMIN_ORDER_TABS.map(
        async (key) =>
          [
            key,
            await this.prisma.order.count({
              where: { AND: [HIDE_UNPAID_CARD_ORDERS, ADMIN_TAB_FILTERS[key]] },
            }),
          ] as const,
      ),
    );

    return Object.fromEntries(entries) as Record<AdminOrderTab, number>;
  }

  // GET /api/orders/:id
  async getOrder(userId: string, id: string) {
    // Filtering by userId makes other users' orders look like "not found"
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: {
        deliveryPartner: {
          select: { name: true, phone: true, avatar: true, vehicleType: true },
        },
      },
      omit: PRIVATE_ORDER_FIELDS,
    });
    if (!order) throw new NotFoundException('Order not found');

    return { order };
  }

  // PUT /api/orders/:id/status (admin)
  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    // Cancelling is more than a status: the items return to stock and a card payment is refunded
    if (dto.status === 'Cancelled') {
      const { order } = await this.cancellation.cancel(id, {
        by: 'admin',
        reason: dto.note,
      });
      return { order };
    }

    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    // A delivered or cancelled order cannot be brought back to life
    if (FINISHED_STATUSES.includes(order.status)) {
      throw new BadRequestException('This order is already finished');
    }

    const history: Prisma.InputJsonValue[] = Array.isArray(order.statusHistory)
      ? (order.statusHistory as Prisma.InputJsonValue[])
      : [];

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        statusHistory: [
          ...history,
          {
            status: dto.status,
            note: dto.note || `Order ${dto.status.toLowerCase()}`,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });

    return { order: updatedOrder };
  }

  // POST /api/orders/:id/cancel
  async cancelMyOrder(userId: string, id: string, dto: CancelOrderDto) {
    const { order, outcome } = await this.cancellation.cancel(id, {
      by: 'customer',
      userId,
      allowedStatuses: CUSTOMER_CANCELLABLE_STATUSES,
      reason: dto.reason,
    });

    return { order: omitPrivateOrderFields(order), refund: outcome };
  }

  // PUT /api/orders/:id/location
  async getOrderLocation(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      select: { liveLocation: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    return { liveLocation: order.liveLocation, status: order.status };
  }
}
