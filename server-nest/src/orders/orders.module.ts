import { Module } from '@nestjs/common';
import { OrderCancellationService } from './order-cancellation.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderCancellationService],
  // The admin and delivery modules cancel orders through the same service
  exports: [OrderCancellationService],
})
export class OrdersModule {}
