import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';

// The service imports it only so Nest can inject it: the tests hand it a fake instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

const DAY = new Date('2026-11-01T10:00:00.000Z');
const OWN_REVIEW = {
  id: true,
  rating: true,
  comment: true,
  isHidden: true,
  createdAt: true,
  updatedAt: true,
};

// One delivered order that contains the product "p1"
const delivered = [{ items: [{ product: 'p1', quantity: 1 }] }];

const savedReview = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  rating: 5,
  comment: 'Great',
  isHidden: false,
  createdAt: DAY,
  updatedAt: DAY,
  ...overrides,
});

function setup() {
  // The transaction: the work inside it reads and writes through these
  const tx = {
    review: {
      upsert: vi.fn().mockResolvedValue(savedReview()),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      // 2 reviews of 5 stars and 1 of 4: the average is 4.67
      groupBy: vi.fn().mockResolvedValue([
        { rating: 5, _count: { _all: 2 } },
        { rating: 4, _count: { _all: 1 } },
      ]),
    },
    product: { update: vi.fn().mockResolvedValue({}) },
  };

  const prisma = {
    product: { findUnique: vi.fn().mockResolvedValue({ id: 'p1' }) },
    order: { findMany: vi.fn().mockResolvedValue(delivered) },
    review: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
  };

  return { service: new ReviewsService(prisma as never), prisma, tx };
}

describe('getProductReviews', () => {
  it('answers "not found" for a product that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.getProductReviews('nope', {}));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it('lists only the VISIBLE reviews, with the author as "First L." and no private data', async () => {
    const { service, prisma } = setup();
    prisma.review.findMany.mockResolvedValue([
      {
        id: 'r1',
        rating: 5,
        comment: 'Great',
        createdAt: DAY,
        updatedAt: DAY,
        user: { name: 'Ali Hassan' },
      },
    ]);
    prisma.review.count.mockResolvedValue(12);
    prisma.review.groupBy.mockResolvedValue([
      { rating: 5, _count: { _all: 12 } },
    ]);

    const result = await service.getProductReviews('p1', {
      limit: 10,
      page: 1,
    });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 'p1', isHidden: false },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 10,
        skip: 0,
      }),
    );
    expect(result.reviews).toEqual([
      {
        id: 'r1',
        rating: 5,
        comment: 'Great',
        createdAt: DAY,
        updatedAt: DAY,
        author: 'Ali H.',
      },
    ]);
    expect(result).toMatchObject({ total: 12, page: 1, pages: 2 });
    expect(result.summary).toMatchObject({ average: 5, count: 12 });
  });

  it('counts the stars of the visible reviews only', async () => {
    const { service, prisma } = setup();

    await service.getProductReviews('p1', {});

    expect(prisma.review.groupBy).toHaveBeenCalledWith({
      by: ['rating'],
      where: { productId: 'p1', isHidden: false },
      _count: { _all: true },
    });
  });

  it('shows 10 reviews by default, and never more than 50 in one answer', async () => {
    const { service, prisma } = setup();

    await service.getProductReviews('p1', {});
    await service.getProductReviews('p1', { limit: 500, page: 3 });

    expect(prisma.review.findMany.mock.calls[0][0]).toMatchObject({
      take: 10,
      skip: 0,
    });
    expect(prisma.review.findMany.mock.calls[1][0]).toMatchObject({
      take: 50,
      skip: 100,
    });
  });
});

describe('getMyReviewState', () => {
  it('gives my review and says I may write one when the product was delivered to me', async () => {
    const { service, prisma } = setup();
    prisma.review.findUnique.mockResolvedValue(savedReview());

    const result = await service.getMyReviewState('u1', 'p1');

    expect(prisma.review.findUnique).toHaveBeenCalledWith({
      where: { userId_productId: { userId: 'u1', productId: 'p1' } },
      select: OWN_REVIEW,
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'Delivered' },
      select: { items: true },
    });
    expect(result).toEqual({ review: savedReview(), canReview: true });
  });

  it('says I may NOT write one when I never received the product', async () => {
    const { service, prisma } = setup();
    prisma.review.findUnique.mockResolvedValue(null);
    prisma.order.findMany.mockResolvedValue([]);

    await expect(service.getMyReviewState('u1', 'p1')).resolves.toEqual({
      review: null,
      canReview: false,
    });
  });
});

describe('saveMyReview', () => {
  it('answers "not found" for a product that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.saveMyReview('u1', 'nope', { rating: 5 }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('refuses a customer who has no delivered order at all', async () => {
    const { service, prisma, tx } = setup();
    prisma.order.findMany.mockResolvedValue([]);

    const error = await failureOf(
      service.saveMyReview('u1', 'p1', { rating: 5 }),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error).toHaveProperty(
      'message',
      'You can review a product after it is delivered to you',
    );
    expect(tx.review.upsert).not.toHaveBeenCalled();
  });

  it('refuses a customer whose delivered orders do not contain this product', async () => {
    const { service, prisma, tx } = setup();
    prisma.order.findMany.mockResolvedValue([
      { items: [{ product: 'p2', quantity: 1 }] },
    ]);

    const error = await failureOf(
      service.saveMyReview('u1', 'p1', { rating: 5 }),
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(tx.review.upsert).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('writes or edits the single review of this customer for this product', async () => {
    const { service, tx } = setup();

    const result = await service.saveMyReview('u1', 'p1', {
      rating: 5,
      comment: 'Great',
    });

    expect(tx.review.upsert).toHaveBeenCalledWith({
      where: { userId_productId: { userId: 'u1', productId: 'p1' } },
      // An edit changes the rating and the comment, and nothing else: a hidden review stays hidden
      update: { rating: 5, comment: 'Great' },
      create: { userId: 'u1', productId: 'p1', rating: 5, comment: 'Great' },
      select: OWN_REVIEW,
    });
    expect(result).toEqual({ review: savedReview() });
  });

  it.each([[undefined], [''], ['    ']])(
    'saves a comment of %j as no comment',
    async (comment) => {
      const { service, tx } = setup();

      await service.saveMyReview('u1', 'p1', { rating: 4, comment });

      expect(tx.review.upsert.mock.calls[0][0].update.comment).toBeNull();
      expect(tx.review.upsert.mock.calls[0][0].create.comment).toBeNull();
    },
  );

  it('trims the comment', async () => {
    const { service, tx } = setup();

    await service.saveMyReview('u1', 'p1', {
      rating: 4,
      comment: '  Good value  ',
    });

    expect(tx.review.upsert.mock.calls[0][0].update.comment).toBe('Good value');
  });

  it('updates the rating of the product from the visible reviews, in the same transaction', async () => {
    const { service, tx } = setup();

    await service.saveMyReview('u1', 'p1', { rating: 5 });

    // Hidden reviews are not counted
    expect(tx.review.groupBy).toHaveBeenCalledWith({
      by: ['rating'],
      where: { productId: 'p1', isHidden: false },
      _count: { _all: true },
    });
    // (5 + 5 + 4) / 3 = 4.67
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { rating: 4.67, reviewCount: 3 },
    });
  });

  it('writes the review before it works out the rating', async () => {
    const { service, tx } = setup();

    await service.saveMyReview('u1', 'p1', { rating: 5 });

    const written = tx.review.upsert.mock.invocationCallOrder[0];
    const counted = tx.review.groupBy.mock.invocationCallOrder[0];
    expect(written).toBeLessThan(counted);
  });
});

describe('deleteMyReview', () => {
  it("removes only this customer's review of this product, and updates the rating", async () => {
    const { service, tx } = setup();

    const result = await service.deleteMyReview('u1', 'p1');

    expect(tx.review.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', productId: 'p1' },
    });
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ message: 'Review deleted' });
  });

  it('is not an error to delete a review that does not exist, and changes nothing', async () => {
    const { service, tx } = setup();
    tx.review.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteMyReview('u1', 'p1')).resolves.toEqual({
      message: 'Review deleted',
    });
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('puts the rating of the product back to 0 when its last review goes', async () => {
    const { service, tx } = setup();
    tx.review.groupBy.mockResolvedValue([]);

    await service.deleteMyReview('u1', 'p1');

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { rating: 0, reviewCount: 0 },
    });
  });
});

describe('getAllReviews (admin)', () => {
  it('lists every review with the product and the customer, and the number in each tab', async () => {
    const { service, prisma } = setup();
    prisma.review.groupBy.mockResolvedValue([
      { isHidden: false, _count: { _all: 7 } },
      { isHidden: true, _count: { _all: 2 } },
    ]);

    const result = await service.getAllReviews({});

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, take: 20, skip: 0 }),
    );
    expect(result.counts).toEqual({ all: 9, visible: 7, hidden: 2 });
  });

  it.each([
    [true, { isHidden: true }],
    [false, { isHidden: false }],
  ])('filters by hidden = %s', async (hidden, where) => {
    const { service, prisma } = setup();

    await service.getAllReviews({ hidden });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(prisma.review.count).toHaveBeenCalledWith({ where });
  });

  it('counts 0 for a tab with no review', async () => {
    const { service } = setup();

    const result = await service.getAllReviews({});

    expect(result.counts).toEqual({ all: 0, visible: 0, hidden: 0 });
  });
});

describe('setVisibility (admin)', () => {
  it('answers "not found" for a review that does not exist', async () => {
    const { service, prisma, tx } = setup();
    prisma.review.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.setVisibility('r9', true));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(tx.review.update).not.toHaveBeenCalled();
  });

  it('hides a review and updates the rating of ITS product', async () => {
    const { service, prisma, tx } = setup();
    prisma.review.findUnique.mockResolvedValue({ productId: 'p7' });

    const result = await service.setVisibility('r1', true);

    expect(tx.review.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { isHidden: true },
    });
    expect(tx.review.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p7', isHidden: false } }),
    );
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p7' } }),
    );
    expect(result).toEqual({ review: { id: 'r1', isHidden: true } });
  });

  it('shows it again the same way', async () => {
    const { service, prisma, tx } = setup();
    prisma.review.findUnique.mockResolvedValue({ productId: 'p7' });

    await service.setVisibility('r1', false);

    expect(tx.review.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { isHidden: false },
    });
  });
});

describe('deleteReview (admin)', () => {
  it('answers "not found" for a review that does not exist', async () => {
    const { service, prisma, tx } = setup();
    prisma.review.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.deleteReview('r9'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(tx.review.delete).not.toHaveBeenCalled();
  });

  it('deletes it and updates the rating of its product', async () => {
    const { service, prisma, tx } = setup();
    prisma.review.findUnique.mockResolvedValue({ productId: 'p7' });

    const result = await service.deleteReview('r1');

    expect(tx.review.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p7' } }),
    );
    expect(result).toEqual({ message: 'Review deleted' });
  });
});
