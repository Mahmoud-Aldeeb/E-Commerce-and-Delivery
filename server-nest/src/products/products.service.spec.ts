import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service.js';

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

// What the code asks the database for, written by hand (not imported from the code under test)
const LIST_INCLUDE = { _count: { select: { variants: true } } };
const DETAIL_INCLUDE = {
  variants: {
    select: {
      id: true,
      size: true,
      color: true,
      colorHex: true,
      stock: true,
      image: true,
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
};

// The body of a request: only what the test is about changes. `as never`: the DTO classes
// are checked by the validation pipe, not by these tests
const productDto = (overrides: Record<string, unknown> = {}) =>
  ({
    name: 'Tee',
    price: 10,
    image: 'main.jpg',
    category: 'Fashion',
    ...overrides,
  }) as never;

// What the database knows about a product before an update
const existingProduct = (overrides: Record<string, unknown> = {}) => ({
  image: 'main.jpg',
  images: ['a.jpg'],
  _count: { variants: 0 },
  ...overrides,
});

const variantRow = (id: string, size: string, color = '') => ({
  id,
  productId: 'p1',
  size,
  color,
  colorHex: null,
  stock: 1,
  image: null,
  sortOrder: 0,
});

function setup() {
  const prisma = {
    category: { findUnique: vi.fn().mockResolvedValue({ id: 'c1' }) },
    product: {
      // The answer of getProduct, which every create and update ends with
      findUnique: vi
        .fn()
        .mockResolvedValue({
          id: 'p1',
          price: 10,
          originalPrice: null,
          variants: [],
        }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'p1' }),
      update: vi.fn().mockResolvedValue({}),
    },
    productVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn(),
  };
  // A transaction here is just "run the work with the same fake"
  prisma.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
    work(prisma),
  );

  return { service: new ProductsService(prisma as never), prisma };
}

describe('getProducts', () => {
  it('asks for everything, newest first, when there are no filters', async () => {
    const { service, prisma } = setup();

    const result = await service.getProducts({} as never);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: LIST_INCLUDE,
      }),
    );
    expect(result).toEqual({ products: [], total: 0, page: 1, pages: 1 });
  });

  it('uses the same filters for the page and for the total', async () => {
    const { service, prisma } = setup();

    await service.getProducts({
      category: 'Fashion',
      search: 'shirt',
      minPrice: 5,
      maxPrice: 50,
      inStock: true,
      limit: 10,
      page: 3,
    } as never);

    const where = {
      category: 'Fashion',
      name: { contains: 'shirt', mode: 'insensitive' },
      price: { gte: 5, lte: 50 },
      stock: { gt: 0 },
    };
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 10,
      skip: 20,
      include: LIST_INCLUDE,
    });
    expect(prisma.product.count).toHaveBeenCalledWith({ where });
  });

  it('treats the category "all" as no filter', async () => {
    const { service, prisma } = setup();

    await service.getProducts({ category: 'all' } as never);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it.each([
    ['price-low', [{ price: 'asc' }, { id: 'asc' }]],
    ['price-high', [{ price: 'desc' }, { id: 'asc' }]],
    ['name', [{ name: 'asc' }, { id: 'asc' }]],
    [
      'rating',
      [
        { rating: { sort: 'desc', nulls: 'last' } },
        { reviewCount: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
    ],
    ['something-unknown', [{ createdAt: 'desc' }, { id: 'asc' }]],
  ])(
    'sorts by "%s", always ending with the id as a tie-breaker',
    async (sort, orderBy) => {
      const { service, prisma } = setup();

      await service.getProducts({ sort } as never);

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );

  it('works out the number of pages from the total', async () => {
    const { service, prisma } = setup();
    prisma.product.count.mockResolvedValue(25);

    const result = await service.getProducts({ limit: 10, page: 2 } as never);

    expect(result).toMatchObject({ total: 25, page: 2, pages: 3 });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 10 }),
    );
  });

  it('says there is at least one page even when nothing matches', async () => {
    const { service } = setup();

    const result = await service.getProducts({ limit: 10 } as never);

    expect(result.pages).toBe(1);
  });

  it('gives the discount and the number of variants, and never the raw count', async () => {
    const { service, prisma } = setup();
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', price: 50, originalPrice: 100, _count: { variants: 3 } },
    ]);

    const result = await service.getProducts({} as never);

    expect(result.products).toEqual([
      {
        id: 'p1',
        price: 50,
        originalPrice: 100,
        discount: 50,
        variantCount: 3,
      },
    ]);
  });
});

describe('getFlashDeals', () => {
  it('takes the 8 products in stock with the biggest original price', async () => {
    const { service, prisma } = setup();
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', price: 50, originalPrice: 100, _count: { variants: 0 } },
    ]);

    const result = await service.getFlashDeals();

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { stock: { gt: 0 } },
      orderBy: { originalPrice: 'desc' },
      take: 8,
      include: LIST_INCLUDE,
    });
    expect(result.products[0]).toMatchObject({ discount: 50, variantCount: 0 });
  });
});

describe('getProduct', () => {
  it('answers "not found" for a product that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.getProduct('nope'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toHaveProperty('message', 'Product not found');
  });

  it('gives the product with its variants and how many they are', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValue({
      id: 'p1',
      price: 50,
      originalPrice: 100,
      variants: [{ id: 'v1' }, { id: 'v2' }],
    });

    const result = await service.getProduct('p1');

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      include: DETAIL_INCLUDE,
    });
    expect(result).toEqual({
      product: {
        id: 'p1',
        price: 50,
        originalPrice: 100,
        variants: [{ id: 'v1' }, { id: 'v2' }],
        discount: 50,
        variantCount: 2,
      },
    });
  });
});

describe('createProduct', () => {
  it('refuses a category that does not exist, and creates nothing', async () => {
    const { service, prisma } = setup();
    prisma.category.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.createProduct(productDto()));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'This category does not exist');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a product without variants, with its extra images cleaned', async () => {
    const { service, prisma } = setup();

    const result = await service.createProduct(
      productDto({
        stock: 5,
        images: ['a.jpg', 'a.jpg', 'main.jpg', ' b.jpg '],
      }),
    );

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: {
        name: 'Tee',
        price: 10,
        image: 'main.jpg',
        category: 'Fashion',
        stock: 5,
        images: ['a.jpg', 'b.jpg'],
      },
    });
    expect(prisma.productVariant.createMany).not.toHaveBeenCalled();
    expect(result.product.id).toBe('p1');
  });

  it('creates the variants too, and the stock of the product is their total', async () => {
    const { service, prisma } = setup();

    await service.createProduct(
      productDto({
        images: ['a.jpg'],
        variants: [
          { size: 'M', color: 'Black', stock: 3 },
          { size: 'L', color: 'Black', stock: 4, image: 'a.jpg' },
        ],
      }),
    );

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: {
        name: 'Tee',
        price: 10,
        image: 'main.jpg',
        category: 'Fashion',
        images: ['a.jpg'],
        stock: 7,
      },
    });
    expect(prisma.productVariant.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: 'p1',
          size: 'M',
          color: 'Black',
          colorHex: null,
          stock: 3,
          image: null,
          sortOrder: 0,
        },
        {
          productId: 'p1',
          size: 'L',
          color: 'Black',
          colorHex: null,
          stock: 4,
          image: 'a.jpg',
          sortOrder: 1,
        },
      ],
    });
  });

  it('refuses a stock sent together with variants', async () => {
    const { service, prisma } = setup();

    const error = await failureOf(
      service.createProduct(
        productDto({ stock: 10, variants: [{ size: 'M', stock: 3 }] }),
      ),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'The stock of a product with variants is the total of its variants: set it on the variants',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses two variants that are the same, and creates nothing', async () => {
    const { service, prisma } = setup();

    const error = await failureOf(
      service.createProduct(
        productDto({
          variants: [
            { size: 'M', stock: 1 },
            { size: ' M ', stock: 2 },
          ],
        }),
      ),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'The variant "M" appears twice');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a variant image that is not an image of the product', async () => {
    const { service, prisma } = setup();

    const error = await failureOf(
      service.createProduct(
        productDto({ variants: [{ size: 'M', stock: 1, image: 'other.jpg' }] }),
      ),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('updateProduct', () => {
  it('answers "not found" for a product that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(null);

    const error = await failureOf(service.updateProduct('nope', {} as never));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toHaveProperty('message', 'Product not found');
  });

  it('refuses a category that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(existingProduct());
    prisma.category.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.updateProduct('p1', { category: 'Nope' } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('leaves the variants alone when they are not sent, and unhooks the images the product dropped', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 2 } }),
    );

    await service.updateProduct('p1', { name: 'New name' } as never);

    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'p1',
        image: { not: null, notIn: ['main.jpg', 'a.jpg'] },
      },
      data: { image: null },
    });
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    expect(prisma.productVariant.deleteMany).not.toHaveBeenCalled();
    // No `stock` here: the total of the variants stays as it is
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: 'New name', images: ['a.jpg'] },
    });
  });

  it('refuses a stock for a product that already has variants', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 2 } }),
    );

    const error = await failureOf(
      service.updateProduct('p1', { stock: 5 } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a stock sent together with new variants', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(existingProduct());

    const error = await failureOf(
      service.updateProduct('p1', {
        stock: 5,
        variants: [{ size: 'M', stock: 1 }],
      } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to remove every variant without saying the stock of the product', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 2 } }),
    );

    const error = await failureOf(
      service.updateProduct('p1', { variants: [] } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'You removed every variant: set the stock of the product, because the old total belonged to the variants',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes every variant when the stock of the product is given', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 2 } }),
    );
    prisma.productVariant.findMany.mockResolvedValue([
      variantRow('v1', 'M'),
      variantRow('v2', 'S'),
    ]);

    await service.updateProduct('p1', { variants: [], stock: 12 } as never);

    expect(prisma.productVariant.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['v1', 'v2'] } },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: 12, images: ['a.jpg'] },
    });
  });

  it('gives a product its first variants: the stock becomes their total, and the product is written LAST', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ images: [] }),
    );

    await service.updateProduct('p1', {
      variants: [
        { size: 'M', stock: 5 },
        { size: 'L', stock: 6 },
      ],
    } as never);

    expect(prisma.productVariant.createMany).toHaveBeenCalledWith({
      data: [
        {
          productId: 'p1',
          size: 'M',
          color: '',
          colorHex: null,
          stock: 5,
          image: null,
          sortOrder: 0,
        },
        {
          productId: 'p1',
          size: 'L',
          color: '',
          colorHex: null,
          stock: 6,
          image: null,
          sortOrder: 1,
        },
      ],
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { images: [], stock: 11 },
    });
    // The lock order of the whole app: the variants first, the product after
    expect(
      prisma.productVariant.createMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.product.update.mock.invocationCallOrder[0]);
  });

  it('lets two variants swap their sizes, by moving them out of the way first', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 2 } }),
    );
    prisma.productVariant.findMany.mockResolvedValue([
      variantRow('v1', 'M'),
      variantRow('v2', 'S'),
    ]);

    await service.updateProduct('p1', {
      variants: [
        { id: 'v1', size: 'S', stock: 5 },
        { id: 'v2', size: 'M', stock: 6 },
      ],
    } as never);

    const update = prisma.productVariant.update;
    expect(update).toHaveBeenCalledTimes(4);
    // Step 1: both leave their names (a temporary one that cannot collide)...
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: 'v1' },
      data: { size: '', color: '~v1' },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: 'v2' },
      data: { size: '', color: '~v2' },
    });
    // Step 2: ...and then take the new ones
    expect(update).toHaveBeenNthCalledWith(3, {
      where: { id: 'v1' },
      data: {
        size: 'S',
        color: '',
        colorHex: null,
        stock: 5,
        image: null,
        sortOrder: 0,
      },
    });
    expect(update).toHaveBeenNthCalledWith(4, {
      where: { id: 'v2' },
      data: {
        size: 'M',
        color: '',
        colorHex: null,
        stock: 6,
        image: null,
        sortOrder: 1,
      },
    });
  });

  it('does not move a variant out of the way when its name did not change', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 1 } }),
    );
    prisma.productVariant.findMany.mockResolvedValue([variantRow('v1', 'M')]);

    await service.updateProduct('p1', {
      variants: [{ id: 'v1', size: 'M', stock: 9 }],
    } as never);

    expect(prisma.productVariant.update).toHaveBeenCalledTimes(1);
    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: {
        size: 'M',
        color: '',
        colorHex: null,
        stock: 9,
        image: null,
        sortOrder: 0,
      },
    });
  });

  it('deletes the variants that are gone BEFORE it updates the ones that stay', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 2 } }),
    );
    prisma.productVariant.findMany.mockResolvedValue([
      variantRow('v1', 'M'),
      variantRow('v2', 'S'),
    ]);

    await service.updateProduct('p1', {
      variants: [{ id: 'v2', size: 'S', stock: 4 }],
    } as never);

    expect(prisma.productVariant.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['v1'] } },
    });
    expect(
      prisma.productVariant.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.productVariant.update.mock.invocationCallOrder[0]);
  });

  it('refuses a variant id that belongs to another product, and writes nothing', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 1 } }),
    );
    prisma.productVariant.findMany.mockResolvedValue([variantRow('v1', 'M')]);

    const error = await failureOf(
      service.updateProduct('p1', {
        variants: [{ id: 'someone-elses', size: 'M', stock: 1 }],
      } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'A variant does not belong to this product',
    );
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('refuses the same variant sent twice', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(
      existingProduct({ _count: { variants: 1 } }),
    );
    prisma.productVariant.findMany.mockResolvedValue([variantRow('v1', 'M')]);

    const error = await failureOf(
      service.updateProduct('p1', {
        variants: [
          { id: 'v1', size: 'M', stock: 1 },
          { id: 'v1', size: 'L', stock: 1 },
        ],
      } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'The same variant appears twice');
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});

describe('deleteProduct', () => {
  it('answers "not found" for a product that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.product.findUnique.mockResolvedValueOnce(null);

    const error = await failureOf(service.deleteProduct('nope'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sets the stock of the variants and of the product to 0, the variants first', async () => {
    const { service, prisma } = setup();

    const result = await service.deleteProduct('p1');

    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { productId: 'p1' },
      data: { stock: 0 },
    });
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { stock: 0 },
    });
    expect(
      prisma.productVariant.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(prisma.product.update.mock.invocationCallOrder[0]);
    expect(result).toEqual({ message: 'Product Updated' });
  });
});
