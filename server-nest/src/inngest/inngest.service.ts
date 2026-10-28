import { Injectable, Logger } from '@nestjs/common';
import { inngest } from './inngest.client.js';

@Injectable()
export class InngestService {
  private readonly logger = new Logger(InngestService.name);

  send(payload: Parameters<typeof inngest.send>[0]) {
    return inngest.send(payload);
  }

  // Never throws: a failed background event must not break the request that triggered it
  async sendSafely(payload: Parameters<typeof inngest.send>[0]) {
    try {
      await inngest.send(payload);
    } catch (error) {
      this.logger.error('Failed to send Inngest events', error as Error);
    }
  }
}
