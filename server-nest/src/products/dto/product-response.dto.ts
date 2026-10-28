import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductResponseDto {
  @ApiProperty({ example: '3f2a9c1e-0b7d-4d6e-9a41-5c8e2b7f1a10' })
  id: string;

  @ApiProperty({ example: 'Fresh Tomatoes' })
  name: string;

  @ApiPropertyOptional({ nullable: true, example: 'Locally grown' })
  description: string | null;

  @ApiProperty({ example: 25.5 })
  price: number;

  @ApiPropertyOptional({ nullable: true, example: 30 })
  originalPrice: number | null;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/tomato.jpg',
  })
  image: string;

  @ApiProperty({ example: 'vegetables' })
  category: string;

  @ApiPropertyOptional({ nullable: true, example: 100 })
  stock: number | null;

  @ApiPropertyOptional({ nullable: true, example: 4.5 })
  rating: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12 })
  reviewCount: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    example: 15,
    description: 'Discount percentage, calculated from price and originalPrice',
  })
  discount: number;
}

// GET /products: one page of results plus the totals
export class ProductListResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  products: ProductResponseDto[];

  @ApiProperty({
    example: 24,
    description: 'Products matching the filters, across all pages',
  })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({
    example: 2,
    description: 'Number of pages (1 when limit is not used)',
  })
  pages: number;
}

// GET /products/flash-deals: only the products
export class ProductsResponseDto {
  @ApiProperty({ type: [ProductResponseDto] })
  products: ProductResponseDto[];
}
export class ProductItemResponseDto {
  @ApiProperty({ type: ProductResponseDto })
  product: ProductResponseDto;
}
