import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GetProductsQueryDto {
  @ApiPropertyOptional({
    example: 'electronics',
    description: 'Filter by category. Use "all" (or omit) for no filter',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: 'head',
    description: 'Case-insensitive search in the product name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 10, description: 'Minimum price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minPrice must be a number' })
  minPrice?: number;

  @ApiPropertyOptional({ example: 100, description: 'Maximum price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'maxPrice must be a number' })
  maxPrice?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Only products that are in stock (stock above 0)',
  })
  @IsOptional()
  // @Type(() => Boolean) would turn the text "false" into true, so we compare the text
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({
    example: 'rating',
    description:
      '"price-low", "price-high", "rating" (best rated first), "name" (A to Z), or anything else for newest first',
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Products per page (1 to 50). Without it, all matches are returned',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a whole number' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(50, { message: 'limit must be at most 50' })
  limit?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number, starting at 1. Used together with limit',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a whole number' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number;
}
