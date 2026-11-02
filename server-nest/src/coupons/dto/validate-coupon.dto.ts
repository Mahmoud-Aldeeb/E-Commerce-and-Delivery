import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Only the product and the quantity: the price always comes from the database
export class CouponItemDto {
  @ApiProperty({ example: '3f2a9c1e-0b7d-4d6e-9a41-5c8e2b7f1a10' })
  @IsString()
  @IsNotEmpty()
  product: string;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1)
  @Max(1000)
  quantity: number;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @Transform(trim)
  @IsString({ message: 'Enter a code' })
  @IsNotEmpty({ message: 'Enter a code' })
  @MaxLength(32, { message: 'This code is not valid' })
  code: string;

  @ApiProperty({ type: [CouponItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CouponItemDto)
  items: CouponItemDto[];
}
