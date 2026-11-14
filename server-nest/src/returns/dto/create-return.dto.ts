import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  MinLength,
} from 'class-validator';
import {
  REFUND_METHODS,
  RETURN_REASONS,
  type RefundMethod,
  type ReturnReason,
} from '../return-rules.js';

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

  @ApiProperty({
    enum: RETURN_REASONS,
    description: 'Only an item with a manufacturing defect can be returned',
  })
  @IsIn(RETURN_REASONS, {
    message: 'Only an item with a manufacturing defect can be returned',
  })
  reason: ReturnReason;

  @ApiProperty({
    description: 'What is wrong with the item (10 to 500 characters)',
  })
  // Spaces around the text do not count: ten spaces are not a description
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Describe the defect' })
  @MinLength(10, {
    message: 'Describe the defect in a few words (at least 10 characters)',
  })
  @MaxLength(500, {
    message: 'The description must be 500 characters or fewer',
  })
  comment: string;

  @ApiPropertyOptional({
    enum: REFUND_METHODS,
    description:
      'Where the refund goes. A card order is refunded to the card. A cash order can choose STORE_WALLET (the default), MOBILE_WALLET or INSTAPAY',
  })
  @IsOptional()
  @IsIn(REFUND_METHODS, { message: 'Choose where the refund goes' })
  refundMethod?: RefundMethod;

  @ApiPropertyOptional({
    description:
      'The mobile number (MOBILE_WALLET), or the InstaPay address or number (INSTAPAY). Needed for those two methods',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'The details must be 60 characters or fewer' })
  refundDestinationDetails?: string;
}
