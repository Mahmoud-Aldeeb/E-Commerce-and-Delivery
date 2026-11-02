import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

// Letters, numbers, dashes and underscores. Saved in capitals,
// so "welcome10" and "WELCOME10" are one code
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

export const COUPON_TYPES = ['PERCENT', 'FIXED'] as const;

export class CreateCouponDto {
  @ApiProperty({
    example: 'WELCOME10',
    description: '3 to 32 letters, numbers, dashes or underscores',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(CODE_PATTERN, {
    message:
      'The code needs 3 to 32 characters: letters, numbers, dashes or underscores',
  })
  code: string;

  @ApiProperty({ enum: COUPON_TYPES, example: 'PERCENT' })
  @IsIn([...COUPON_TYPES], { message: 'type must be PERCENT or FIXED' })
  type: 'PERCENT' | 'FIXED';

  @ApiProperty({
    example: 10,
    description: 'PERCENT: above 0 and up to 100. FIXED: the dollars taken off',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'value must be a number with at most 2 decimals' },
  )
  @Min(0.01, { message: 'value must be above 0' })
  value: number;

  @ApiPropertyOptional({
    nullable: true,
    example: 20,
    description: 'PERCENT only: the most it can take off',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxDiscount?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 15,
    description: 'The least the items must cost',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minSubtotal?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'startsAt must be a valid date' })
  startsAt?: Date | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'expiresAt must be a valid date' })
  expiresAt?: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 100,
    description: 'How many orders in total. Empty = no limit',
  })
  @IsOptional()
  @IsInt({ message: 'usageLimit must be a whole number' })
  @Min(1)
  usageLimit?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 1,
    description: 'How many orders for each customer. Empty = no limit',
  })
  @IsOptional()
  @IsInt({ message: 'perUserLimit must be a whole number' })
  @Min(1)
  perUserLimit?: number | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
