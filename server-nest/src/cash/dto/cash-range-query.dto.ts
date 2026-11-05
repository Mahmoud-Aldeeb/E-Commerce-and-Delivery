import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CashRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'First day (store time). Default: 6 days before the end',
  })
  @IsOptional()
  @IsString()
  @Matches(DAY_PATTERN, { message: 'from must look like 2026-11-01' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-07',
    description: 'Last day, included (store time). Default: today',
  })
  @IsOptional()
  @IsString()
  @Matches(DAY_PATTERN, { message: 'to must look like 2026-11-01' })
  to?: string;
}
