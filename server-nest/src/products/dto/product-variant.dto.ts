import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProductVariantDto {
  @ApiPropertyOptional({
    description:
      'Send the id of a variant that already exists, so it keeps its identity',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({
    example: 'M',
    description: 'Empty when the product has no sizes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'A size must be 20 characters or fewer' })
  size?: string | null;

  @ApiPropertyOptional({
    example: 'Black',
    description: 'Empty when the product has no colours',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'A colour name must be 30 characters or fewer' })
  color?: string | null;

  @ApiPropertyOptional({ example: '#111827' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  colorHex?: string | null;

  @ApiProperty({ example: 10, description: 'Units of this variant in stock' })
  @IsInt({ message: 'The stock of a variant must be a whole number' })
  @Min(0, { message: 'The stock of a variant cannot be negative' })
  @Max(100_000)
  stock: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'One of the images of the product',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  image?: string | null;
}
