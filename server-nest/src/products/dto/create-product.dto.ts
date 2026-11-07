import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ProductVariantDto } from './product-variant.dto.js';

export class CreateProductDto {
  @ApiProperty({ example: 'Cotton T-Shirt' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Soft cotton, regular fit' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 25.5, description: 'Current selling price' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Price before discount. Used to calculate the discount %',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/tshirt.jpg',
    description: 'The main image: cards, orders and link previews use it',
  })
  @IsString()
  @IsNotEmpty()
  image: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'More images, besides the main one (up to 8)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8, { message: 'A product can have at most 8 extra images' })
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(500, { each: true })
  images?: string[];

  @ApiProperty({ example: 'Fashion' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({
    example: 'Nike',
    description: 'The brand or maker. An empty text means none',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'The brand must be 60 characters or fewer' })
  brand?: string | null;

  @ApiPropertyOptional({
    example: '100% cotton',
    description: 'What the clothes are made of. An empty text means none',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'The material must be 100 characters or fewer' })
  material?: string | null;

  @ApiPropertyOptional({
    example: 100,
    description:
      'Units in stock. Not allowed for a product with variants: its stock is the total of their stock',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    type: [ProductVariantDto],
    description:
      'Sizes and colours (up to 100). On an update, sending the list REPLACES the variants; leaving it out keeps them',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'A product can have at most 100 variants' })
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];
}
