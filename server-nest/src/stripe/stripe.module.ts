import { Global, Module } from '@nestjs/common';
import { StripeService } from './stripe.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';
import { OrdersModule } from '../orders/orders.module.js';

@Global()
@Module({
  // The webhook cancels orders through OrderCancellationService, which OrdersModule exports
  imports: [OrdersModule],
  controllers: [StripeWebhookController],
  providers: [StripeService, StripeWebhookService],
  exports: [StripeService],
})
export class StripeModule {}
