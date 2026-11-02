import { Module } from '@nestjs/common';
import {
  AdminReviewsController,
  ProductReviewsController,
} from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  controllers: [ProductReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
