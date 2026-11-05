import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordSettlementDto {
  @ApiProperty({
    example: 150.5,
    description: 'Dollars the courier handed over to the store',
  })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'amount must be a number with at most 2 decimals' },
  )
  @Min(0.01, { message: 'amount must be above 0' })
  @Max(1_000_000, { message: 'amount is too large' })
  amount: number;

  @ApiPropertyOptional({
    example: 'Handed over in the evening',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(200, { message: 'The note must be 200 characters or fewer' })
  note?: string;

  @ApiPropertyOptional({
    example: '2026-11-01T18:00:00.000Z',
    description:
      'When the money was handed over. Default: now. It cannot be in the future',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'settledAt must be a valid date' })
  settledAt?: Date;
}
