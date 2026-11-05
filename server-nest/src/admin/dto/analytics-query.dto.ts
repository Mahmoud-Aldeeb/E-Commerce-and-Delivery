import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export const ANALYTICS_PERIODS = [7, 30, 90] as const;

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    enum: ANALYTICS_PERIODS,
    example: 30,
    description: 'How many days, today included. Default: 30',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn([...ANALYTICS_PERIODS], { message: 'days must be 7, 30 or 90' })
  days?: number;
}
