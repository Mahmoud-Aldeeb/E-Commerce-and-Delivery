import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ADMIN_SETTABLE_STATUSES } from '../../common/constants/order-status.constants.js';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ADMIN_SETTABLE_STATUSES, example: 'Packed' })
  @IsIn(ADMIN_SETTABLE_STATUSES, { message: 'Invalid status' })
  status: string;

  @ApiPropertyOptional({
    example: 'The customer asked to cancel by phone',
    description:
      'Shown in the order history. Defaults to "Order <status in lowercase>"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'The note must be 200 characters or fewer' })
  note?: string;
}
