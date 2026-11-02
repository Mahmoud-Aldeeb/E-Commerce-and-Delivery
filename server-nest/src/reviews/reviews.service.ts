import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { pageArgs, pageInfo } from '../common/utils/pagination.util.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GetAdminReviewsQueryDto } from './dto/get-admin-reviews-query.dto.js';
import { SaveReviewDto } from './dto/save-review.dto.js';
import { authorLabel, boughtProduct, summarize } from './review-rules.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50; // a public list never returns everything in one answer
const ADMIN_LIMIT = 20;

// What the owner of a review sees of it
const OWN_REVIEW = {
  id: true,
  rating: true,
  comment: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
} as const;

const VISIBLE = { isHidden: false } as const;

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  private async ensureProductExists(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');
  }

  // Only a customer whose order with this product was DELIVERED can review it
  private async hasReceived(userId: string, productId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId, status: 'Delivered' },
      select: { items: true },
    });
    return boughtProduct(orders, productId);
  }

  // The rating on the product is worked out from its VISIBLE reviews, inside the same
  // transaction that changed them: the two can never disagree
  private async refreshProductRating(
    tx: Prisma.TransactionClient,
    productId: string,
  ) {
    const groups = await tx.review.groupBy({
      by: ['rating'],
      where: { productId, ...VISIBLE },
      _count: { _all: true },
    });
    const { average, count } = summarize(
      groups.map((group) => ({
        rating: group.rating,
        count: group._count._all,
      })),
    );
    await tx.product.update({
      where: { id: productId },
      data: { rating: average, reviewCount: count },
    });
  }

  // GET /api/products/:productId/reviews (public)
  async getProductReviews(productId: string, query: PaginationQueryDto) {
    await this.ensureProductExists(productId);

    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = query.page ?? 1;
    const where = { productId, ...VISIBLE };

    const [reviews, total, groups] = await Promise.all([
      this.prisma.review.findMany({
        where,
        // The id breaks ties, so a review never shows on two pages (or on none)
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        author: authorLabel(review.user.name),
      })),
      ...pageInfo(total, page, limit),
      summary: summarize(
        groups.map((group) => ({
          rating: group.rating,
          count: group._count._all,
        })),
      ),
    };
  }

  // GET /api/products/:productId/reviews/me: my review (if any) and whether I may write one
  async getMyReviewState(userId: string, productId: string) {
    await this.ensureProductExists(productId);

    const [review, canReview] = await Promise.all([
      this.prisma.review.findUnique({
        where: { userId_productId: { userId, productId } },
        select: OWN_REVIEW,
      }),
      this.hasReceived(userId, productId),
    ]);
    return { review, canReview };
  }

  // PUT /api/products/:productId/reviews: writes my review, or edits it
  async saveMyReview(userId: string, productId: string, dto: SaveReviewDto) {
    await this.ensureProductExists(productId);

    if (!(await this.hasReceived(userId, productId))) {
      throw new ForbiddenException(
        'You can review a product after it is delivered to you',
      );
    }

    const comment = dto.comment?.trim() ? dto.comment.trim() : null;

    const review = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.upsert({
        where: { userId_productId: { userId, productId } },
        // An edit never touches isHidden: a hidden review stays hidden whatever its author does
        update: { rating: dto.rating, comment },
        create: { userId, productId, rating: dto.rating, comment },
        select: OWN_REVIEW,
      });
      await this.refreshProductRating(tx, productId);
      return saved;
    });

    return { review };
  }

  // DELETE /api/products/:productId/reviews: removes my review. Safe to repeat
  async deleteMyReview(userId: string, productId: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.review.deleteMany({
        where: { userId, productId },
      });
      if (count > 0) await this.refreshProductRating(tx, productId);
    });
    return { message: 'Review deleted' };
  }

  // ---------- Admin ----------

  // GET /api/reviews
  async getAllReviews(query: GetAdminReviewsQueryDto) {
    const limit = Math.min(query.limit ?? ADMIN_LIMIT, MAX_LIMIT);
    const page = query.page ?? 1;
    const where: Prisma.ReviewWhereInput =
      query.hidden === undefined ? {} : { isHidden: query.hidden };

    const [reviews, total, groups] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        ...pageArgs(limit, page),
        select: {
          ...OWN_REVIEW,
          product: { select: { id: true, name: true, image: true } },
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.review.count({ where }),
      // The numbers of the tabs do not depend on the tab that is open
      this.prisma.review.groupBy({ by: ['isHidden'], _count: { _all: true } }),
    ]);

    const hidden = groups.find((group) => group.isHidden)?._count._all ?? 0;
    const visible = groups.find((group) => !group.isHidden)?._count._all ?? 0;

    return {
      reviews,
      ...pageInfo(total, page, limit),
      counts: { all: hidden + visible, visible, hidden },
    };
  }

  // PUT /api/reviews/:id/visibility
  async setVisibility(id: string, isHidden: boolean) {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      select: { productId: true },
    });
    if (!existing) throw new NotFoundException('Review not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { isHidden } });
      await this.refreshProductRating(tx, existing.productId);
    });
    return { review: { id, isHidden } };
  }

  // DELETE /api/reviews/:id
  async deleteReview(id: string) {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      select: { productId: true },
    });
    if (!existing) throw new NotFoundException('Review not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      await this.refreshProductRating(tx, existing.productId);
    });
    return { message: 'Review deleted' };
  }
}
