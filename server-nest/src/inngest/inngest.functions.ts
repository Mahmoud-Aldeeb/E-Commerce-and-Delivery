import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cron } from 'inngest';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { Role } from '../generated/prisma/enums.js';
import { inngest } from './inngest.client.js';
import {
  lowStockEmail,
  monthlyOffersEmail,
  orderConfirmationEmail,
  type OrderEmailItem,
} from './email-templates.js';
import { orderNumber } from '../orders/order-number.js';
import {
  ACTIVE_STATUSES,
  FINISHED_STATUSES,
} from '../common/constants/order-status.constants.js';
import { appendStatusHistory } from '../common/utils/status-history.util.js';

const LOW_STOCK_THRESHOLD = 10;
const EMAIL_BATCH_SIZE = 10;

interface InngestDeps {
  prisma: PrismaService;
  mail: MailService;
  config: ConfigService;
}

// Inngest functions are plain objects, not Nest providers, so their dependencies
// are passed in here (main.ts calls this once, after the app is created)
export function createInngestFunctions({ prisma, mail, config }: InngestDeps) {
  const logger = new Logger('InngestFunctions');

  // Sends an email to all admins when a product stock drops below the threshold
  const checkLowStock = inngest.createFunction(
    {
      id: 'check-low-stock',
      name: 'Low Stock Alert',
      triggers: [{ event: 'inventory/stock.updated' }],
    },
    async ({ event, step }) => {
      const { productId } = event.data as { productId: string };

      const product = await step.run('fetch-product', () =>
        prisma.product.findUnique({ where: { id: productId } }),
      );

      if (
        !product ||
        product.stock === null ||
        product.stock >= LOW_STOCK_THRESHOLD
      ) {
        return { skipped: true, stock: product?.stock };
      }

      await step.run('send-low-stock-email', async () => {
        // Admins live in the database now (role = ADMIN), not in an env variable
        const admins = await prisma.user.findMany({
          where: { role: Role.ADMIN },
          select: { email: true },
        });
        if (admins.length === 0)
          return { skipped: true, reason: 'No admin users' };

        await mail.sendEmail({
          to: admins.map((a) => a.email).join(','),
          subject: `Low Stock Alert: ${product.name}`,
          body: lowStockEmail(product),
        });
      });

      return { alerted: true, product: product.name, stock: product.stock };
    },
  );

  // 1st of every month at 10:00: email the top deals to every user
  const sendMonthlyOffers = inngest.createFunction(
    {
      id: 'send-monthly-offers',
      name: 'Monthly Deals Email',
      triggers: [cron('0 10 1 * *')],
    },
    async ({ step }) => {
      // Bulk emails go out only when someone turned them on on purpose
      if (config.get<string>('MONTHLY_OFFERS_ENABLED') !== 'true') {
        return { skipped: true, reason: 'Monthly offers are turned off' };
      }
      const { deals, users } = await step.run(
        'fetch-deals-and-users',
        async () => {
          const deals = await prisma.product.findMany({
            where: { stock: { gt: 0 } },
            orderBy: { originalPrice: 'desc' },
            take: 6,
          });
          const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true },
          });
          return { deals, users };
        },
      );

      if (users.length === 0 || deals.length === 0) {
        return { skipped: true, reason: 'No users or deals' };
      }

      const shopUrl = `${(config.get<string>('CLIENT_URL') ?? 'http://localhost:3000').replace(/\/+$/, '')}/products`;
      let sent = 0;

      // Batches keep each step short and avoid overwhelming the mail server
      for (let i = 0; i < users.length; i += EMAIL_BATCH_SIZE) {
        const batch = users.slice(i, i + EMAIL_BATCH_SIZE);

        sent += await step.run(`send-offers-batch-${i}`, async () => {
          let sentInBatch = 0;
          for (const user of batch) {
            // Catch per email: a retry of the whole batch would email people twice
            try {
              await mail.sendEmail({
                to: user.email,
                subject: "This month's top deals, just for you!",
                body: monthlyOffersEmail(user.name, deals, shopUrl),
              });
              sentInBatch++;
            } catch {
              logger.warn(`Offer email failed for user ${user.id}`);
            }
          }
          return sentInBatch;
        });
      }

      return { sent };
    },
  );

  // 5 minutes after an order is placed, assign it to a free rider if nobody has yet
  const autoAssignRider = inngest.createFunction(
    {
      id: 'auto-assign-rider',
      name: 'Auto Assign Delivery Rider',
      triggers: [{ event: 'order/placed' }],
    },
    async ({ event, step }) => {
      const { orderId } = event.data as { orderId: string };

      await step.sleep('wait-5-min', '5m');

      return step.run('assign-rider', async () => {
        const order = await prisma.order.findUnique({ where: { id: orderId } });

        if (!order) return { skipped: true, reason: 'Order not found' };
        if (order.deliveryPartnerId)
          return { skipped: true, reason: 'Already assigned' };
        if (FINISHED_STATUSES.includes(order.status)) {
          return { skipped: true, reason: `Order is ${order.status}` };
        }

        // A rider is "busy" while they hold an active delivery
        const busyOrders = await prisma.order.findMany({
          where: {
            status: { in: ACTIVE_STATUSES },
            deliveryPartnerId: { not: null },
          },
          select: { deliveryPartnerId: true },
        });
        const busyRiderIds = busyOrders
          .map((o) => o.deliveryPartnerId)
          .filter((id): id is string => id !== null);

        const rider = await prisma.deliveryPartner.findFirst({
          where: { isActive: true, id: { notIn: busyRiderIds } },
        });
        if (!rider) return { skipped: true, reason: 'No riders available' };

        await prisma.order.update({
          where: { id: orderId },
          data: {
            deliveryPartnerId: rider.id,
            deliveryOtp: String(randomInt(100000, 1000000)), // always 6 digits
            status: 'Assigned',
            statusHistory: appendStatusHistory(
              order.statusHistory,
              'Assigned',
              `Auto-assigned to ${rider.name}`,
            ),
          },
        });

        return {
          assigned: true,
          riderId: rider.id,
          riderName: rider.name,
          orderId,
        };
      });
    },
  );

  // Right after an order is placed (cash) or paid (card): tell the customer what was ordered.
  // The "order/placed" event comes from OrdersService (cash) and from the Stripe webhook (card)
  const sendOrderConfirmation = inngest.createFunction(
    {
      id: 'send-order-confirmation',
      name: 'Order Confirmation Email',
      triggers: [{ event: 'order/placed' }],
    },
    async ({ event, step }) => {
      const { orderId } = event.data as { orderId: string };

      // One step on purpose: the order is read and the email is sent together,
      // so a retry never works with an old copy of the order
      return step.run('send-confirmation-email', async () => {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: { select: { name: true, email: true, phone: true } },
          },
        });

        if (!order) return { skipped: true, reason: 'Order not found' };
        // The customer cancelled in the seconds since it was placed: a confirmation would confuse
        if (order.status === 'Cancelled') {
          return { skipped: true, reason: 'Order was cancelled' };
        }

        const clientUrl = (
          config.get<string>('CLIENT_URL') ?? 'http://localhost:3000'
        ).replace(/\/+$/, '');
        const items = Array.isArray(order.items)
          ? (order.items as unknown as OrderEmailItem[])
          : [];
        const address = (order.shippingAddress ?? {}) as Record<
          string,
          unknown
        >;
        const text = (value: unknown) => String(value ?? '');
        const number = orderNumber(order.id);

        await mail.sendEmail({
          to: order.user.email,
          subject: `Order confirmed: ${number}`,
          body: orderConfirmationEmail({
            number,
            customerName: order.user.name,
            customerPhone: order.user.phone || null,
            items,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee ?? 0,
            tax: order.tax ?? 0,
            total: order.total,
            paymentMethod: order.paymentMethod,
            address: {
              label: text(address.label),
              address: text(address.address),
              city: text(address.city),
              state: text(address.state),
              zip: text(address.zip),
            },
            orderUrl: `${clientUrl}/orders/${order.id}`,
          }),
        });

        return { sent: true, orderId };
      });
    },
  );

  return [
    checkLowStock,
    sendMonthlyOffers,
    autoAssignRider,
    sendOrderConfirmation,
  ];
}
