import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

// "all" means "no filter" in GET /products?category=..., so no category may use that name
const RESERVED_NAME = 'all';

// The number of products comes with every category: the admin page shows it
// and uses it to know which categories can be deleted
const WITH_COUNT = { _count: { select: { products: true } } } as const;

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private toResponse<T extends { _count: { products: number } }>({
    _count,
    ...category
  }: T) {
    return { ...category, productCount: _count.products };
  }

  // The name is the identity of a category (every product stores it), so it must be
  // unique ignoring case. `exceptId` lets a category keep (or re-case) its own name
  private async ensureNameFree(name: string, exceptId?: string) {
    if (name.toLowerCase() === RESERVED_NAME) {
      throw new BadRequestException(
        'This name is reserved. Choose another one',
      );
    }

    const taken = await this.prisma.category.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('A category with this name already exists');
    }
  }

  private async ensureExists(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  // GET /api/categories (public)
  async getCategories() {
    const categories = await this.prisma.category.findMany({
      // The id breaks ties, so the order never changes between two requests
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: WITH_COUNT,
    });
    return { categories: categories.map((item) => this.toResponse(item)) };
  }

  // POST /api/categories
  async createCategory({ name, sortOrder }: CreateCategoryDto) {
    await this.ensureNameFree(name);

    // A new category goes to the end of the list unless an order is given
    let order = sortOrder;
    if (order === undefined) {
      const { _max } = await this.prisma.category.aggregate({
        _max: { sortOrder: true },
      });
      order = (_max.sortOrder ?? 0) + 1;
    }

    const category = await this.prisma.category.create({
      data: { name, sortOrder: order },
      include: WITH_COUNT,
    });
    return { category: this.toResponse(category) };
  }

  // PUT /api/categories/:id
  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.ensureExists(id);
    if (dto.name !== undefined) await this.ensureNameFree(dto.name, id);

    // A field that was not sent is undefined, and Prisma leaves it as it is.
    // A new name reaches the products by itself (the foreign key is ON UPDATE CASCADE)
    const category = await this.prisma.category.update({
      where: { id },
      data: { name: dto.name, sortOrder: dto.sortOrder },
      include: WITH_COUNT,
    });
    return { category: this.toResponse(category) };
  }

  // DELETE /api/categories/:id
  async deleteCategory(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: WITH_COUNT,
    });
    if (!category) throw new NotFoundException('Category not found');

    const count = category._count.products;
    if (count > 0) {
      throw new ConflictException(
        `This category has ${count} ${count === 1 ? 'product' : 'products'}. Move them to another category first`,
      );
    }

    try {
      await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      // The database refuses too: a product was added after the check above
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'A product was just added to this category. Move it first',
        );
      }
      throw error;
    }

    return { message: 'Category deleted' };
  }
}
