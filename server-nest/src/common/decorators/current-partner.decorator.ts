import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export type AuthPartner = NonNullable<Request['partner']>;

// Reads req.partner, which DeliveryAuthGuard sets after all its checks pass
export const CurrentPartner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPartner => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.partner!;
  },
);
