import { Global, Module } from '@nestjs/common';
import { CouponsController } from './coupons.controller.js';
import { CouponsService } from './coupons.service.js';

// Global (like InngestModule): OrdersService needs the service, and this keeps the orders module untouched
@Global()
@Module({
  controllers: [CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
