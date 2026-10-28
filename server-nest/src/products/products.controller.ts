import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { GetProductsQueryDto } from './dto/get-products-query.dto.js';
import {
  ProductItemResponseDto,
  ProductListResponseDto,
  ProductsResponseDto,
} from './dto/product-response.dto.js';
import { MessageResponseDto } from '../common/dto/message-response.dto.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';

@ApiTags('Products')
@Controller('products') // + prefix 'api' = /api/products
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('flash-deals')
  @ApiOperation({
    summary: 'Get up to 8 in-stock products with the biggest original prices',
  })
  @ApiOkResponse({ type: ProductsResponseDto })
  getFlashDeals() {
    return this.productsService.getFlashDeals();
  }
  @Get()
  @ApiOperation({ summary: 'List products with optional filters and sorting' })
  @ApiOkResponse({ type: ProductListResponseDto })
  @ApiBadRequestResponse({
    description: 'minPrice or maxPrice is not a number',
  })
  getProducts(@Query() query: GetProductsQueryDto) {
    return this.productsService.getProducts(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by id' })
  @ApiOkResponse({ type: ProductItemResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getProduct(@Param('id') id: string) {
    return this.productsService.getProduct(id);
  }

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product (admin only)' })
  @ApiCreatedResponse({ type: ProductItemResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or missing product fields' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product (admin only)' })
  @ApiOkResponse({ type: ProductItemResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid product fields' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.updateProduct(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Mark a product as out of stock (admin only). Sets stock to 0; the product is not removed',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  deleteProduct(@Param('id') id: string) {
    return this.productsService.deleteProduct(id);
  }
}
