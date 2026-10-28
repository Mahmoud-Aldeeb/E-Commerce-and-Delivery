import { Global, Module } from '@nestjs/common';
import { InngestService } from './inngest.service.js';

@Global()
@Module({
  providers: [InngestService],
  exports: [InngestService],
})
export class InngestModule {}
