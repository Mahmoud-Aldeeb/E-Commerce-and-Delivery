import { Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { ProductsResponseDto } from '../products/dto/product-response.dto.js';
import {
  FavoriteIdsResponseDto,
  FavoriteStateResponseDto,
} from './dto/favorite-response.dto.js';
import { FavoritesService } from './favorites.service.js';

@ApiTags('Favorites')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
// Every route here is the logged-in user's own list
@UseGuards(AuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({
    summary: 'The products the current user saved, newest first',
  })
  @ApiOkResponse({ type: ProductsResponseDto })
  getFavorites(@CurrentUser() user: AuthUser) {
    return this.favoritesService.getFavorites(user.id);
  }

  @Get('ids')
  @ApiOperation({
    summary: 'Only the ids of the saved products (for the heart buttons)',
  })
  @ApiOkResponse({ type: FavoriteIdsResponseDto })
  getFavoriteIds(@CurrentUser() user: AuthUser) {
    return this.favoritesService.getFavoriteIds(user.id);
  }

  @Put(':productId')
  @ApiOperation({ summary: 'Save a product. Repeating it changes nothing' })
  @ApiOkResponse({ type: FavoriteStateResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  addFavorite(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    return this.favoritesService.addFavorite(user.id, productId);
  }

  @Delete(':productId')
  @ApiOperation({
    summary: 'Remove a saved product. Repeating it changes nothing',
  })
  @ApiOkResponse({ type: FavoriteStateResponseDto })
  removeFavorite(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    return this.favoritesService.removeFavorite(user.id, productId);
  }
}
