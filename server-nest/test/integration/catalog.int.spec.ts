import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { ProductsService } from '../../src/products/products.service.js';
import { makeProduct } from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The service imports it only so Nest can inject it: the tests hand it the real client instead
vi.mock('../../src/prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));

let db: TestDatabase;

beforeAll(() => {
  db = createTestPrisma();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await resetDatabase(db.prisma);
});

type VariantSeed = {
  size: string;
  color?: string;
  hex?: string;
  stock: number;
};

// A product whose stock is the TOTAL of its variants, like the app keeps it
async function makeProductWith(
  id: string,
  variants: VariantSeed[],
  overrides: Partial<Prisma.ProductUncheckedCreateInput> = {},
) {
  await makeProduct(db.prisma, id, {
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
    ...overrides,
  });
  await db.prisma.productVariant.createMany({
    data: variants.map((variant, index) => ({
      productId: id,
      size: variant.size,
      color: variant.color ?? '',
      colorHex: variant.hex ?? null,
      stock: variant.stock,
      sortOrder: index,
    })),
  });
}

async function seed() {
  await db.prisma.category.create({ data: { name: 'Shoes' } });

  // M/Red has no stock left: p1 has "M" and has "Red", but never "M in Red" to sell
  await makeProductWith('p1', [
    { size: 'M', color: 'Black', hex: '#111827', stock: 3 },
    { size: 'L', color: 'Red', hex: '#ff0000', stock: 2 },
    { size: 'M', color: 'Red', hex: '#ff0000', stock: 0 },
  ]);
  await makeProductWith('p2', [
    { size: 'M', color: 'Red', hex: '#ff0000', stock: 5 },
  ]);
  await makeProduct(db.prisma, 'p3', { stock: 10 }); // no variants at all
  await makeProductWith(
    'p4',
    [
      { size: '42', color: 'White', stock: 4 },
      { size: '40', color: 'White', stock: 1 },
    ],
    { category: 'Shoes' },
  );
  await makeProductWith('p5', [{ size: 'XS', color: 'Black', stock: 0 }]);
}

const service = () => new ProductsService(db.prisma as never);
const idsOf = (result: { products: { id: string }[] }) =>
  result.products.map((product) => product.id).sort();

describe('the size and colour filters on a real database', () => {
  it('finds a size and a colour only when they are in the SAME variant with stock', async () => {
    await seed();

    const result = await service().getProducts({
      size: 'M',
      color: 'Red',
    } as never);

    expect(idsOf(result)).toEqual(['p2']);
    expect(result.total).toBe(1);
  });

  it('finds every product that has the size in stock', async () => {
    await seed();

    const result = await service().getProducts({ size: 'M' } as never);

    expect(idsOf(result)).toEqual(['p1', 'p2']);
    expect(result.total).toBe(2);
  });

  it('finds every product that has the colour in stock', async () => {
    await seed();

    const result = await service().getProducts({ color: 'Red' } as never);

    expect(idsOf(result)).toEqual(['p1', 'p2']);
  });

  it('does not care about capitals', async () => {
    await seed();

    const result = await service().getProducts({
      size: 'm',
      color: 'RED',
    } as never);

    expect(idsOf(result)).toEqual(['p2']);
  });

  it('does not count a variant that has no stock left', async () => {
    await seed();

    const result = await service().getProducts({ size: 'XS' } as never);

    expect(idsOf(result)).toEqual([]);
  });

  it('lists every product, the ones without variants too, when no size or colour is asked', async () => {
    await seed();

    const result = await service().getProducts({} as never);

    expect(idsOf(result)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('works together with a category and the pages', async () => {
    await seed();

    const result = await service().getProducts({
      category: 'Shoes',
      size: '42',
      limit: 1,
      page: 1,
    } as never);

    expect(idsOf(result)).toEqual(['p4']);
    expect(result).toMatchObject({ total: 1, page: 1, pages: 1 });
  });
});

describe('the filter options on a real database', () => {
  it('lists the sizes and colours that have stock, sorted, with the code of a colour', async () => {
    await seed();

    const result = await service().getFilterOptions();

    // XS has no stock (p5), so it is not offered
    expect(result).toEqual({
      sizes: ['M', 'L', '40', '42'],
      colors: [
        { name: 'Black', hex: '#111827' },
        { name: 'Red', hex: '#ff0000' },
        { name: 'White', hex: null },
      ],
    });
  });

  it('lists only the options of the category that is asked', async () => {
    await seed();

    const result = await service().getFilterOptions('Shoes');

    expect(result).toEqual({
      sizes: ['40', '42'],
      colors: [{ name: 'White', hex: null }],
    });
  });
});

describe('the brand and the material on a real database', () => {
  it('saves them, cleans them, and an empty text clears only that field', async () => {
    await db.prisma.category.create({ data: { name: 'Test' } });

    const { product } = await service().createProduct({
      name: 'Tee',
      price: 10,
      image: 'main.jpg',
      category: 'Test',
      stock: 5,
      brand: ' Nike ',
      material: '100%   cotton',
    } as never);

    expect(product).toMatchObject({ brand: 'Nike', material: '100% cotton' });

    const updated = await service().updateProduct(product.id, {
      brand: '',
    } as never);

    expect(updated.product).toMatchObject({
      brand: null,
      material: '100% cotton',
    });
  });
});
