import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MessageResponseDto } from '../common/dto/message-response.dto.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { CategoriesService } from './categories.service.js';
import {
  CategoryItemResponseDto,
  CategoryListResponseDto,
} from './dto/category-response.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

@ApiTags('Categories')
@Controller('categories') // + prefix 'api' = /api/categories
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary: 'List the categories in display order, with their product counts',
  })
  @ApiOkResponse({ type: CategoryListResponseDto })
  getCategories() {
    return this.categoriesService.getCategories();
  }

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a category (admin only)' })
  @ApiCreatedResponse({ type: CategoryItemResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or reserved name' })
  @ApiConflictResponse({ description: 'The name is already used' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.createCategory(dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Rename a category or change its order (admin only). A new name is applied to its products too',
  })
  @ApiOkResponse({ type: CategoryItemResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or reserved name' })
  @ApiConflictResponse({ description: 'The name is already used' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.updateCategory(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a category that has no products (admin only)',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'Admin access required' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'The category still has products' })
  deleteCategory(@Param('id') id: string) {
    return this.categoriesService.deleteCategory(id);
  }
}
