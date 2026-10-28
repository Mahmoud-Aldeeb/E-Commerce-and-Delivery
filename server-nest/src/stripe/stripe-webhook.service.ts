import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { InngestService } from '../inngest/inngest.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { StripeService } from './stripe.service.js';
import type { Order } from '../generated/prisma/client.js';
import { OrderCancellationService } from '../orders/order-cancellation.service.js';
import { InsufficientStockError, takeStock } from '../orders/stock.util.js';

type StoredItem = { product: string; quantity: number };

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private stripe: StripeService,
    private prisma: PrismaService,
    private inngest: InngestService,
    private config: ConfigService,
    private cancellation: OrderCancellationService,
  ) {}

  // Verifies that the request really comes from Stripe (signature check on the RAW body)
  constructEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new InternalServerErrorException('Webhook secret not configured');
    }
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing signature or body');
    }

    try {
      return this.stripe.client.webhooks.constructEvent(
        rawBody,
        signature,
        secret,
      );
    } catch (error) {
      this.logger.warn(
        `Webhook signature verification failed: ${(error as Error).message}`,
      );
      throw new BadRequestException('Webhook signature verification failed');
    }
  }

  async handleEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.onPaymentSucceeded(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case 'payment_intent.canceled':
        await this.discardUnpaidOrder(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case 'payment_intent.payment_failed':
        // One failed attempt is not the end: the customer can retry in the same checkout
        this.logger.log(`Payment attempt failed for ${event.data.object.id}`);
        break;

      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }
  }

  // The order id was stored in the Checkout Session metadata when we created it
  private async findOrderId(
    paymentIntentId: string,
  ): Promise<string | undefined> {
    const sessions = await this.stripe.client.checkout.sessions.list({
      payment_intent: paymentIntentId,
    });
    return sessions.data[0]?.metadata?.orderId;
  }

  private toItems(items: Prisma.JsonValue): StoredItem[] {
    return Array.isArray(items) ? (items as unknown as StoredItem[]) : [];
  }

  private async onPaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const orderId = await this.findOrderId(paymentIntent.id);
    if (!orderId) {
      this.logger.warn(
        `No checkout session found for payment ${paymentIntent.id}`,
      );
      return;
    }
    let paidOrder: Order | null;
    try {
      // Marking the order as paid and taking the stock succeed or fail together
      paidOrder = await this.prisma.$transaction(async (tx) => {
        // Only the FIRST delivery of this event flips isPaid. Stripe retries and
        // duplicates find count = 0 and do nothing, so stock is never taken twice.
        const { count } = await tx.order.updateMany({
          where: { id: orderId, isPaid: false },
          data: { isPaid: true, paymentIntentId: paymentIntent.id },
        });
        if (count === 0) return null;

        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        await takeStock(tx, this.toItems(order.items));
        return order;
      });
    } catch (error) {
      if (!(error instanceof InsufficientStockError)) throw error;

      // The transaction was rolled back, so the order is still unpaid in the database.
      // The customer HAS paid: cancel the order and give the money back
      await this.cancellation.cancelOutOfStock(orderId, paymentIntent.id);
      return;
    }

    if (!paidOrder) {
      this.logger.log(
        `Order ${orderId} was already processed (or does not exist)`,
      );
      return;
    }

    await this.inngest.sendSafely([
      { name: 'order/placed', data: { orderId } },
      ...this.toItems(paidOrder.items).map((item) => ({
        name: 'inventory/stock.updated',
        data: { productId: item.product },
      })),
    ]);
  }

  // Cleanup of an abandoned checkout. isPaid: false makes sure a paid order is never deleted.
  private async discardUnpaidOrder(paymentIntent: Stripe.PaymentIntent) {
    const orderId = await this.findOrderId(paymentIntent.id);
    if (!orderId) return;

    await this.prisma.order.deleteMany({
      where: { id: orderId, isPaid: false },
    });
  }
}
