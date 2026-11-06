import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { GetProductsQueryDto } from './dto/get-products-query.dto.js';
import {
  DETAIL_INCLUDE,
  LIST_INCLUDE,
  toPublicProduct,
} from './product-shape.js';
import {
  cleanImages,
  normalizeVariants,
  sumStock,
  type NormalizedVariant,
} from './variant-rules.js';

const STOCK_FROM_VARIANTS =
  'The stock of a product with variants is the total of its variants: set it on the variants';

const STOCK_WHEN_VARIANTS_REMOVED =
  'You removed every variant: set the stock of the product, because the old total belonged to the variants';
@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

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

  // Writes the variants of a product so that it ends up with EXACTLY `wanted`.
  // Runs inside the transaction of the caller. It touches the variants in a fixed order and the
  // product last, the same order an order uses: two writers can never wait for each other
  private async saveVariants(
    tx: Prisma.TransactionClient,
    productId: string,
    wanted: NormalizedVariant[],
  ) {
    const existing = await tx.productVariant.findMany({ where: { productId } });
    const known = new Map(existing.map((variant) => [variant.id, variant]));

    const sent = wanted.flatMap((variant) => (variant.id ? [variant.id] : []));
    if (sent.some((id) => !known.has(id))) {
      throw new BadRequestException(
        'A variant does not belong to this product',
      );
    }
    if (new Set(sent).size !== sent.length) {
      throw new BadRequestException('The same variant appears twice');
    }

    // 1) The ones that are gone leave first: their size and colour are free again
    const keep = new Set(sent);
    const removed = existing
      .map((variant) => variant.id)
      .filter((id) => !keep.has(id))
      .sort();
    if (removed.length > 0) {
      await tx.productVariant.deleteMany({ where: { id: { in: removed } } });
    }

    // 2) The ones that stay. They keep their id: carts and orders hold it.
    // A variant that changes its size or colour first moves out of the way, because two variants
    // can swap names (M becomes S while S becomes M) and the pair must never be the same twice
    const updates = wanted
      .filter((variant) => variant.id)
      .sort((a, b) => (a.id as string).localeCompare(b.id as string));
    for (const variant of updates) {
      const old = known.get(variant.id as string);
      if (old && (old.size !== variant.size || old.color !== variant.color)) {
        await tx.productVariant.update({
          where: { id: variant.id as string },
          data: { size: '', color: `~${variant.id}` },
        });
      }
    }
    for (const variant of updates) {
      await tx.productVariant.update({
        where: { id: variant.id as string },
        data: {
          size: variant.size,
          color: variant.color,
          colorHex: variant.colorHex,
          stock: variant.stock,
          image: variant.image,
          sortOrder: variant.sortOrder,
        },
      });
    }

    // 3) The new ones
    const created = wanted.filter((variant) => !variant.id);
    if (created.length > 0) {
      await tx.productVariant.createMany({
        data: created.map((variant) => ({
          productId,
          size: variant.size,
          color: variant.color,
          colorHex: variant.colorHex,
          stock: variant.stock,
          image: variant.image,
          sortOrder: variant.sortOrder,
        })),
      });
    }
  }

  // GET /api/products/flash-deals
  async getFlashDeals() {
    const products = await this.prisma.product.findMany({
      where: { stock: { gt: 0 } },
      orderBy: { originalPrice: 'desc' },
      take: 8,
      include: LIST_INCLUDE,
    });

    return { products: products.map((product) => toPublicProduct(product)) };
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

    // The stock of a product with variants is the total of theirs, so this works for them too
    if (inStock) where.stock = { gt: 0 };

    // The page and the total come from the same filters, and run at the same time
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: this.getOrderBy(sort),
        take: limit, // undefined = no limit
        skip: limit ? (page - 1) * limit : undefined,
        include: LIST_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      products: products.map((product) => toPublicProduct(product)),
      total,
      page,
      pages: limit ? Math.max(1, Math.ceil(total / limit)) : 1,
    };
  }

  // GET /api/products/:id
  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { product: toPublicProduct(product) };
  }

  // POST /api/products
  async createProduct(dto: CreateProductDto) {
    await this.ensureCategoryExists(dto.category);

    const images = cleanImages(dto.images, dto.image);

    let variants: NormalizedVariant[] = [];
    if (dto.variants && dto.variants.length > 0) {
      const result = normalizeVariants(dto.variants, [dto.image, ...images]);
      if (!result.ok) throw new BadRequestException(result.message);
      if (dto.stock !== undefined)
        throw new BadRequestException(STOCK_FROM_VARIANTS);
      variants = result.variants;
    }

    const { variants: _variants, images: _images, ...fields } = dto;

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...fields,
          images,
          // The product keeps the total of its variants
          ...(variants.length > 0 ? { stock: sumStock(variants) } : {}),
        },
      });
      if (variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((variant) => ({
            productId: product.id,
            size: variant.size,
            color: variant.color,
            colorHex: variant.colorHex,
            stock: variant.stock,
            image: variant.image,
            sortOrder: variant.sortOrder,
          })),
        });
      }
      return product;
    });

    return this.getProduct(created.id);
  }

  // PUT /api/products/:id
  async updateProduct(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: {
        image: true,
        images: true,
        _count: { select: { variants: true } },
      },
    });
    if (!existing) throw new NotFoundException('Product not found');

    if (dto.category !== undefined)
      await this.ensureCategoryExists(dto.category);

    const image = dto.image ?? existing.image;
    const images = cleanImages(dto.images ?? existing.images, image);

    // undefined = the variants were not sent: they stay as they are
    let variants: NormalizedVariant[] | undefined;
    if (dto.variants !== undefined) {
      const result = normalizeVariants(dto.variants, [image, ...images]);
      if (!result.ok) throw new BadRequestException(result.message);
      variants = result.variants;
    }

    const willHaveVariants = variants
      ? variants.length > 0
      : existing._count.variants > 0;
    if (willHaveVariants && dto.stock !== undefined) {
      throw new BadRequestException(STOCK_FROM_VARIANTS);
    }

    // The product had variants and will have none: it is a plain product again, so its stock
    // must be said. The number it holds now is the total of options that are about to disappear
    if (
      !willHaveVariants &&
      existing._count.variants > 0 &&
      dto.stock === undefined
    ) {
      throw new BadRequestException(STOCK_WHEN_VARIANTS_REMOVED);
    }

    const { variants: _variants, images: _images, ...fields } = dto;

    await this.prisma.$transaction(async (tx) => {
      // A product that drops an image stops showing it on the variants that used it
      await tx.productVariant.updateMany({
        where: {
          productId: id,
          image: { not: null, notIn: [image, ...images] },
        },
        data: { image: null },
      });

      if (variants) await this.saveVariants(tx, id, variants);

      await tx.product.update({
        where: { id },
        data: {
          ...fields,
          images,
          ...(variants && variants.length > 0
            ? { stock: sumStock(variants) }
            : {}),
        },
      });
    });

    return this.getProduct(id);
  }

  // DELETE /api/products/:id
  async deleteProduct(id: string) {
    await this.ensureExists(id);

    await this.prisma.$transaction(async (tx) => {
      // The variants first, then the product: the same order every other writer uses
      await tx.productVariant.updateMany({
        where: { productId: id },
        data: { stock: 0 },
      });
      await tx.product.update({ where: { id }, data: { stock: 0 } });
    });
    return { message: 'Product Updated' };
  }
}
