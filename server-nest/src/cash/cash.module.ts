import { Module } from '@nestjs/common';
import {
  AdminCashController,
  PartnerCashController,
} from './cash.controller.js';
import { CashService } from './cash.service.js';

@Module({
  controllers: [AdminCashController, PartnerCashController],
  providers: [CashService],
})
export class CashModule {}
