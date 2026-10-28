import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service.js';

// Called by Stripe's servers, not by users: hidden from Swagger, no AuthGuard.
// The Stripe signature is what proves the request is genuine.

@ApiExcludeController()
@Controller('stripe')
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  @Post()
  // Stripe only checks for a 2xx answer; the old API returned 200 as well
  @HttpCode(HttpStatus.OK)
  async handle(
    // rawBody is available because main.ts creates the app with { rawBody: true }
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const event = this.webhookService.constructEvent(req.rawBody, signature);
    await this.webhookService.handleEvent(event);
    return { received: true };
  }
}
