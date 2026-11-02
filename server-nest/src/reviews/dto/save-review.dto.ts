import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const RATING_MESSAGE = 'Choose a rating from 1 to 5';

export class SaveReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt({ message: RATING_MESSAGE })
  @Min(1, { message: RATING_MESSAGE })
  @Max(5, { message: RATING_MESSAGE })
  rating: number;

  @ApiPropertyOptional({
    example: 'Works well and arrived on time',
    maxLength: 1000,
  })
  @IsOptional()
  // Runs before the checks: spaces around the comment are not part of it
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000, { message: 'The comment must be 1000 characters or fewer' })
  comment?: string;
}
