import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LIST_INCLUDE, toPublicProduct } from '../products/product-shape.js';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  // GET /api/favorites: the products, the newest favorite first
  async getFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      // productId breaks ties, so the order is the same on every request
      orderBy: [{ createdAt: 'desc' }, { productId: 'asc' }],
      include: { product: { include: LIST_INCLUDE } },
    });
    return {
      products: favorites.map((favorite) => toPublicProduct(favorite.product)),
    };
  }

  // GET /api/favorites/ids: only the ids. Every heart button on a page needs just this
  async getFavoriteIds(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      select: { productId: true },
    });
    return { ids: favorites.map((favorite) => favorite.productId) };
  }

  // PUT /api/favorites/:productId. Safe to repeat
  async addFavorite(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // skipDuplicates: saving the same product twice (a double click, two tabs) is not an error
    await this.prisma.favorite.createMany({
      data: [{ userId, productId }],
      skipDuplicates: true,
    });
    return { favorited: true };
  }

  // DELETE /api/favorites/:productId. Safe to repeat. The userId is part of the condition,
  // so a user can only ever remove their own favorite
  async removeFavorite(userId: string, productId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId, productId } });
    return { favorited: false };
  }
}
