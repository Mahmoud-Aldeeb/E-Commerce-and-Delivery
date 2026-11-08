import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RETURN_REASONS, type ReturnReason } from '../return-rules.js';

export class ReturnItemDto {
  @ApiProperty({ description: 'Product id' })
  @IsString({ message: 'Invalid return item' })
  @IsNotEmpty({ message: 'Invalid return item' })
  product: string;

  @ApiPropertyOptional({
    description: 'The variant (size/colour) of a product that has options',
  })
  @IsOptional()
  @IsString()
  variant?: string | null;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;
}

export class CreateReturnDto {
  @ApiProperty({ type: [ReturnItemDto] })
  @IsArray({ message: 'Choose the items to return' })
  @ArrayNotEmpty({ message: 'Choose the items to return' })
  @ArrayMaxSize(50, { message: 'Too many items in one return' })
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @ApiProperty({ enum: RETURN_REASONS })
  @IsIn(RETURN_REASONS, { message: 'Choose why you are returning the items' })
  reason: ReturnReason;

  @ApiPropertyOptional({ description: 'Up to 500 characters' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'The comment must be 500 characters or fewer' })
  comment?: string;
}
