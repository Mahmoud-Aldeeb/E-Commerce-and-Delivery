import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service.js';
import { PartnerAuthController } from './partner-auth.controller.js';
import { DeliveriesController } from './deliveries.controller.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [OrdersModule],
  controllers: [PartnerAuthController, DeliveriesController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
