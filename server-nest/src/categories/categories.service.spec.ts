import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { CategoriesService } from './categories.service.js';

vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

const WITH_COUNT = { _count: { select: { products: true } } };

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// A category as the database returns it, with the number of its products
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: 'Fashion',
  sortOrder: 2,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  _count: { products: 4 },
  ...overrides,
});

function setup() {
  const category = {
    findMany: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null), // by default no other category has the name
    findUnique: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const service = new CategoriesService({ category } as never);
  return { service, category };
}

describe('getCategories', () => {
  it('lists them in display order, with a stable tie-breaker, and turns _count into productCount', async () => {
    const { service, category } = setup();
    category.findMany.mockResolvedValue([
      row(),
      row({ id: 'c2', name: 'Toys', _count: { products: 0 } }),
    ]);

    const result = await service.getCategories();

    expect(category.findMany).toHaveBeenCalledWith({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      include: WITH_COUNT,
    });
    expect(result.categories.map((item) => item.productCount)).toEqual([4, 0]);
    expect(result.categories[0]).not.toHaveProperty('_count');
  });
});

describe('createCategory', () => {
  it.each([['all'], ['All'], ['ALL']])(
    'refuses the reserved name "%s"',
    async (name) => {
      const { service, category } = setup();

      const error = await failureOf(service.createCategory({ name }));

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error).toHaveProperty(
        'message',
        'This name is reserved. Choose another one',
      );
      expect(category.create).not.toHaveBeenCalled();
    },
  );

  it('refuses a name that exists, ignoring the case', async () => {
    const { service, category } = setup();
    category.findFirst.mockResolvedValue({ id: 'c9' });

    const error = await failureOf(service.createCategory({ name: 'fashion' }));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'A category with this name already exists',
    );
    expect(category.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: 'fashion', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(category.create).not.toHaveBeenCalled();
  });

  it('puts a new category after the last one', async () => {
    const { service, category } = setup();
    category.aggregate.mockResolvedValue({ _max: { sortOrder: 6 } });
    category.create.mockImplementation(async ({ data }: { data: object }) =>
      row({ ...data, _count: { products: 0 } }),
    );

    const result = await service.createCategory({ name: 'Pets' });

    expect(category.create).toHaveBeenCalledWith({
      data: { name: 'Pets', sortOrder: 7 },
      include: WITH_COUNT,
    });
    expect(result.category).toMatchObject({
      name: 'Pets',
      sortOrder: 7,
      productCount: 0,
    });
  });

  it('starts the order at 1 when there is no category yet', async () => {
    const { service, category } = setup();
    category.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
    category.create.mockImplementation(async ({ data }: { data: object }) =>
      row({ ...data }),
    );

    await service.createCategory({ name: 'Pets' });

    expect(category.create.mock.calls[0][0].data).toEqual({
      name: 'Pets',
      sortOrder: 1,
    });
  });

  it('keeps an order that was given, even 0, without asking for the last one', async () => {
    const { service, category } = setup();
    category.create.mockImplementation(async ({ data }: { data: object }) =>
      row({ ...data }),
    );

    await service.createCategory({ name: 'Pets', sortOrder: 0 });

    expect(category.aggregate).not.toHaveBeenCalled();
    expect(category.create.mock.calls[0][0].data).toEqual({
      name: 'Pets',
      sortOrder: 0,
    });
  });
});

describe('updateCategory', () => {
  it('answers "not found" for a category that does not exist', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.updateCategory('c1', { name: 'Gadgets' }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(category.update).not.toHaveBeenCalled();
  });

  it('renames it, and lets the category keep (or re-case) its own name', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue({ id: 'c1' });
    category.update.mockResolvedValue(row({ name: 'fashion' }));

    await service.updateCategory('c1', { name: 'fashion' });

    // The name check leaves the category itself out
    expect(category.findFirst).toHaveBeenCalledWith({
      where: {
        name: { equals: 'fashion', mode: 'insensitive' },
        id: { not: 'c1' },
      },
      select: { id: true },
    });
    expect(category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { name: 'fashion', sortOrder: undefined },
      include: WITH_COUNT,
    });
  });

  it('does not check the name when only the order changes', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue({ id: 'c1' });
    category.update.mockResolvedValue(row({ sortOrder: 9 }));

    await service.updateCategory('c1', { sortOrder: 9 });

    expect(category.findFirst).not.toHaveBeenCalled();
    expect(category.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { name: undefined, sortOrder: 9 },
      include: WITH_COUNT,
    });
  });

  it('refuses a name that another category has', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue({ id: 'c1' });
    category.findFirst.mockResolvedValue({ id: 'c2' });

    const error = await failureOf(
      service.updateCategory('c1', { name: 'Toys' }),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(category.update).not.toHaveBeenCalled();
  });

  it('refuses the reserved name', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue({ id: 'c1' });

    const error = await failureOf(
      service.updateCategory('c1', { name: 'all' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(category.update).not.toHaveBeenCalled();
  });
});

describe('deleteCategory', () => {
  it('answers "not found" for a category that does not exist', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.deleteCategory('c1'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(category.delete).not.toHaveBeenCalled();
  });

  it.each([
    [1, 'This category has 1 product. Move them to another category first'],
    [3, 'This category has 3 products. Move them to another category first'],
  ])(
    'refuses a category that still has %i product(s)',
    async (count, message) => {
      const { service, category } = setup();
      category.findUnique.mockResolvedValue(
        row({ _count: { products: count } }),
      );

      const error = await failureOf(service.deleteCategory('c1'));

      expect(error).toBeInstanceOf(ConflictException);
      expect(error).toHaveProperty('message', message);
      expect(category.delete).not.toHaveBeenCalled();
    },
  );

  it('deletes an empty category', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue(row({ _count: { products: 0 } }));
    category.delete.mockResolvedValue(undefined);

    const result = await service.deleteCategory('c1');

    expect(category.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(result).toEqual({ message: 'Category deleted' });
  });

  it('turns a database refusal into a clear message when a product was added in between', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue(row({ _count: { products: 0 } }));
    category.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: 'test',
        },
      ),
    );

    const error = await failureOf(service.deleteCategory('c1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'A product was just added to this category. Move it first',
    );
  });

  it('lets any other database error through', async () => {
    const { service, category } = setup();
    category.findUnique.mockResolvedValue(row({ _count: { products: 0 } }));
    category.delete.mockRejectedValue(new Error('connection lost'));

    const error = await failureOf(service.deleteCategory('c1'));

    expect(error).toHaveProperty('message', 'connection lost');
  });
});
