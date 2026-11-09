import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

// The ledger functions (wallet.ledger.ts) are plain functions: orders and returns import them directly
@Module({
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
