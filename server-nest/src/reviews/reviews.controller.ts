import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { MessageResponseDto } from '../common/dto/message-response.dto.js';
import { AdminGuard } from '../common/guards/admin/admin.guard.js';
import { AuthGuard } from '../common/guards/auth/auth.guard.js';
import { GetAdminReviewsQueryDto } from './dto/get-admin-reviews-query.dto.js';
import { SaveReviewDto } from './dto/save-review.dto.js';
import { SetReviewVisibilityDto } from './dto/set-review-visibility.dto.js';
import { ReviewsService } from './reviews.service.js';

// The reviews of one product: reading is public, writing needs a signed-in customer
@ApiTags('Reviews')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({
    summary:
      'The visible reviews of a product, newest first, with the rating summary',
  })
  @ApiOkResponse({ description: '{ reviews, total, page, pages, summary }' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getReviews(
    @Param('productId') productId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.reviewsService.getProductReviews(productId, query);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'My review of this product (if any), and whether I may write one',
  })
  @ApiOkResponse({ description: '{ review, canReview }' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getMine(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    return this.reviewsService.getMyReviewState(user.id, productId);
  }

  @Put()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Write my review of a product I received, or edit it (one review per product)',
  })
  @ApiOkResponse({ description: '{ review }' })
  @ApiBadRequestResponse({
    description: 'The rating is not from 1 to 5, or the comment is too long',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  @ApiForbiddenResponse({ description: 'The product was not delivered to you' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  saveMine(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
    @Body() dto: SaveReviewDto,
  ) {
    return this.reviewsService.saveMyReview(user.id, productId, dto);
  }

  @Delete()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete my review of this product. Repeating it changes nothing',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
  deleteMine(
    @CurrentUser() user: AuthUser,
    @Param('productId') productId: string,
  ) {
    return this.reviewsService.deleteMyReview(user.id, productId);
  }
}

// Moderation: every review of the store
@ApiTags('Reviews')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'Admin access required' })
// Class-level guards run before method-level ones: the user is read first, then checked as admin
@UseGuards(AuthGuard, AdminGuard)
@Controller('reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({
    summary:
      'All reviews, newest first, with the number in each tab (admin only)',
  })
  @ApiOkResponse({ description: '{ reviews, total, page, pages, counts }' })
  getAll(@Query() query: GetAdminReviewsQueryDto) {
    return this.reviewsService.getAllReviews(query);
  }

  @Put(':id/visibility')
  @ApiOperation({ summary: 'Hide a review, or show it again (admin only)' })
  @ApiOkResponse({ description: '{ review: { id, isHidden } }' })
  @ApiNotFoundResponse({ description: 'Review not found' })
  setVisibility(@Param('id') id: string, @Body() dto: SetReviewVisibilityDto) {
    return this.reviewsService.setVisibility(id, dto.isHidden);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a review (admin only)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiNotFoundResponse({ description: 'Review not found' })
  deleteReview(@Param('id') id: string) {
    return this.reviewsService.deleteReview(id);
  }
}
