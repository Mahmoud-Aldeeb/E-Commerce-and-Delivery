import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: '3f2a9c1e-0b7d-4d6e-9a41-5c8e2b7f1a10' })
  id: string;

  @ApiProperty({ example: 'Home & Kitchen' })
  name: string;

  @ApiProperty({ example: 3 })
  sortOrder: number;

  @ApiProperty({ example: 4, description: 'Products in this category' })
  productCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CategoryListResponseDto {
  @ApiProperty({ type: [CategoryResponseDto] })
  categories: CategoryResponseDto[];
}

export class CategoryItemResponseDto {
  @ApiProperty({ type: CategoryResponseDto })
  category: CategoryResponseDto;
}
