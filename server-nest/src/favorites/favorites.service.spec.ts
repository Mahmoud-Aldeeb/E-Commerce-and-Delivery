import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { FavoritesService } from './favorites.service.js';

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

const product = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Smart Fitness Watch',
  price: 59.99,
  originalPrice: 79.99, // a discount of 25%
  stock: 20,
  ...overrides,
});

function setup() {
  const prisma = {
    favorite: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    product: { findUnique: vi.fn() },
  };
  return { service: new FavoritesService(prisma as never), prisma };
}

describe('getFavorites', () => {
  it("lists the user's products in the order the database gives, with their discount", async () => {
    const { service, prisma } = setup();
    prisma.favorite.findMany.mockResolvedValue([
      { product: product({ id: 'p2', price: 10, originalPrice: null }) },
      { product: product() },
    ]);

    const result = await service.getFavorites('u1');

    expect(prisma.favorite.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: [{ createdAt: 'desc' }, { productId: 'asc' }],
      include: { product: true },
    });
    expect(result.products.map((item) => item.id)).toEqual(['p2', 'p1']);
    expect(result.products.map((item) => item.discount)).toEqual([0, 25]);
  });

  it('answers an empty list when nothing is saved', async () => {
    const { service } = setup();

    await expect(service.getFavorites('u1')).resolves.toEqual({ products: [] });
  });
});

describe('getFavoriteIds', () => {
  it('returns only the ids, and only for this user', async () => {
    const { service, prisma } = setup();
    prisma.favorite.findMany.mockResolvedValue([
      { productId: 'p2' },
      { productId: 'p1' },
    ]);

    const result = await service.getFavoriteIds('u1');

    expect(prisma.favorite.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { productId: true },
    });
    expect(result).toEqual({ ids: ['p2', 'p1'] });
  });
});

describe('addFavorite', () => {
  it('saves a product for the user', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1' });

    const result = await service.addFavorite('u1', 'p1');

    expect(prisma.favorite.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', productId: 'p1' }],
      skipDuplicates: true,
    });
    expect(result).toEqual({ favorited: true });
  });

  it('is not an error to save the same product again', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.favorite.createMany.mockResolvedValue({ count: 0 }); // it was already saved

    await expect(service.addFavorite('u1', 'p1')).resolves.toEqual({
      favorited: true,
    });
  });

  it('answers "not found" for a product that does not exist, and saves nothing', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.addFavorite('u1', 'nope'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toHaveProperty('message', 'Product not found');
    expect(prisma.favorite.createMany).not.toHaveBeenCalled();
  });
});

describe('removeFavorite', () => {
  it("removes only the user's own favorite (the user id is part of the condition)", async () => {
    const { service, prisma } = setup();

    const result = await service.removeFavorite('u1', 'p1');

    expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', productId: 'p1' },
    });
    expect(result).toEqual({ favorited: false });
  });

  it('is not an error to remove a product that was not saved', async () => {
    const { service, prisma } = setup();
    prisma.favorite.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeFavorite('u1', 'p1')).resolves.toEqual({
      favorited: false,
    });
  });
});
