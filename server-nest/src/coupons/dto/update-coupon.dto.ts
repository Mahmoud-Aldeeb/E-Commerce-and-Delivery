import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCouponDto } from './create-coupon.dto.js';

// The code never changes (orders remember it). Every other field is optional.
// For the fields that can be empty, send null to clear them
export class UpdateCouponDto extends PartialType(
  OmitType(CreateCouponDto, ['code'] as const),
) {}
