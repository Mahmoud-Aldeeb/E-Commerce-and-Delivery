import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { GetProductsQueryDto } from './dto/get-products-query.dto.js';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private withDiscount<
    T extends { price: number; originalPrice: number | null },
  >(product: T) {
    const discount =
      product.originalPrice && product.price
        ? Math.round(
            ((product.originalPrice - product.price) / product.originalPrice) *
              100,
          )
        : 0;
    return { ...product, discount };
  }

  // Every order ends with `id`: when many products share the same price (or rating),
  // a tie-breaker is needed, otherwise the same product can appear on two pages
  // and another one can disappear
  private getOrderBy(sort?: string): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'price-low':
        return [{ price: 'asc' }, { id: 'asc' }];
      case 'price-high':
        return [{ price: 'desc' }, { id: 'asc' }];
      case 'name':
        return [{ name: 'asc' }, { id: 'asc' }];
      case 'rating':
        // nulls last: a product without a rating must not come first
        return [
          { rating: { sort: 'desc', nulls: 'last' } },
          { reviewCount: { sort: 'desc', nulls: 'last' } },
          { id: 'asc' },
        ];
      default:
        return [{ createdAt: 'desc' }, { id: 'asc' }];
    }
  }

  private async ensureExists(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  // A product must belong to a category that exists: a clear message instead of a database error
  private async ensureCategoryExists(name: string) {
    const category = await this.prisma.category.findUnique({
      where: { name },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('This category does not exist');
    }
  }

  // GET /api/products/flash-deals
  async getFlashDeals() {
    const products = await this.prisma.product.findMany({
      where: { stock: { gt: 0 } },
      orderBy: { originalPrice: 'desc' },
      take: 8,
    });

    return { products: products.map((p) => this.withDiscount(p)) };
  }

  // GET /api/products
  async getProducts({
    category,
    search,
    minPrice,
    maxPrice,
    inStock,
    sort,
    limit,
    page = 1,
  }: GetProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {};

    if (category && category !== 'all') where.category = category;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const price: Prisma.FloatFilter = {};
    if (minPrice) price.gte = minPrice;
    if (maxPrice) price.lte = maxPrice;
    if (minPrice || maxPrice) where.price = price;

    if (inStock) where.stock = { gt: 0 };

    // The page and the total come from the same filters, and run at the same time
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: this.getOrderBy(sort),
        take: limit, // undefined = no limit
        skip: limit ? (page - 1) * limit : undefined,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      products: products.map((product) => this.withDiscount(product)),
      total,
      page,
      pages: limit ? Math.max(1, Math.ceil(total / limit)) : 1,
    };
  }

  // GET /api/products/:id
  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { product: this.withDiscount(product) };
  }

  // POST /api/products
  async createProduct(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.category);
    const product = await this.prisma.product.create({ data: dto });
    return { product };
  }

  // PUT /api/products/:id
  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.ensureExists(id);
    // The category is optional on update: it is checked only when it is sent
    if (dto.category !== undefined) {
      await this.ensureCategoryExists(dto.category);
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
    });
    return { product };
  }

  // DELETE /api/products/:id
  async deleteProduct(id: string) {
    await this.ensureExists(id);
    await this.prisma.product.update({
      where: { id },
      data: { stock: 0 },
    });
    return { message: 'Product Updated' };
  }
}
