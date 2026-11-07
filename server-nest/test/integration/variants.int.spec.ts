import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { OrderCancellationService } from '../../src/orders/order-cancellation.service.js';
import { OrdersService } from '../../src/orders/orders.service.js';
import {
  InsufficientStockError,
  restoreStock,
  takeStock,
  type StoredItem,
} from '../../src/orders/stock.util.js';
import { ProductsService } from '../../src/products/products.service.js';
import {
  ADDRESS,
  imageOf,
  line,
  makeOrder,
  makeProduct,
  makeUser,
} from './factories.js';
import {
  createTestPrisma,
  resetDatabase,
  type TestDatabase,
} from './support.js';

// The services import these only so Nest can inject them: the tests hand them fakes (or the real client)
vi.mock('../../src/prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../../src/stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));
vi.mock('../../src/inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
}));
vi.mock('../../src/coupons/coupons.service.js', () => ({
  CouponsService: class CouponsService {},
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
  id: string;
  size: string;
  color?: string;
  stock: number;
  image?: string | null;
};

// A product ("p1") with options. Its stock is the TOTAL of its variants, like the app keeps it
async function makeShirt(variants: VariantSeed[]) {
  await makeProduct(db.prisma, 'p1', {
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
  });
  await db.prisma.productVariant.createMany({
    data: variants.map((variant, index) => ({
      id: variant.id,
      productId: 'p1',
      size: variant.size,
      color: variant.color ?? '',
      stock: variant.stock,
      image: variant.image ?? null,
      sortOrder: index,
    })),
  });
}

const variantStock = async (id: string) =>
  (
    await db.prisma.productVariant.findUniqueOrThrow({
      where: { id },
      select: { stock: true },
    })
  ).stock;
const productStock = async (id = 'p1') =>
  (
    await db.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { stock: true },
    })
  ).stock;

// The rule the whole feature stands on: the stock of a product is the total of its variants
async function expectTotalToBeTheSumOfVariants(productId = 'p1') {
  const rows = await db.prisma.productVariant.findMany({
    where: { productId },
    select: { stock: true },
  });
  const sum = rows.reduce((total, row) => total + row.stock, 0);
  expect(await productStock(productId)).toBe(sum);
}

const rejectedOf = (results: PromiseSettledResult<unknown>[]) =>
  results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

// Every call is its own transaction on its own connection, so they really run at the same time
const takeInTransaction = (items: StoredItem[]) =>
  db.prisma.$transaction((tx) => takeStock(tx, items));

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('takeStock with variants on a real database', () => {
  it('never sells more than a variant has when many orders take it at the same moment', async () => {
    await makeShirt([
      { id: 'v1', size: 'M', stock: 5 },
      { id: 'v2', size: 'L', stock: 5 },
    ]);

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        takeInTransaction([{ product: 'p1', variant: 'v1', quantity: 1 }]),
      ),
    );

    const failed = rejectedOf(results);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(5);
    expect(failed).toHaveLength(7);
    for (const result of failed) {
      expect(result.reason).toBeInstanceOf(InsufficientStockError);
      expect((result.reason as InsufficientStockError).variantId).toBe('v1');
    }
    expect(await variantStock('v1')).toBe(0);
    expect(await variantStock('v2')).toBe(5); // the other size was never touched
    expect(await productStock()).toBe(5);
  });

  it('gives every variant its own stock when orders of different sizes and quantities arrive together', async () => {
    await makeShirt([
      { id: 'v1', size: 'M', stock: 10 },
      { id: 'v2', size: 'L', stock: 10 },
    ]);

    const results = await Promise.allSettled([
      // 4 x 2 = 8 units of M: all fit
      ...Array.from({ length: 4 }, () =>
        takeInTransaction([{ product: 'p1', variant: 'v1', quantity: 2 }]),
      ),
      // 4 x 3 = 12 units of L: only three orders (9 units) fit
      ...Array.from({ length: 4 }, () =>
        takeInTransaction([{ product: 'p1', variant: 'v2', quantity: 3 }]),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(7);
    expect(rejectedOf(results)).toHaveLength(1);
    expect(await variantStock('v1')).toBe(2);
    expect(await variantStock('v2')).toBe(1);
    expect(await productStock()).toBe(3);
    await expectTotalToBeTheSumOfVariants();
  });

  it('puts everything back when a later item is short (the variant taken first returns)', async () => {
    await makeShirt([{ id: 'v1', size: 'M', stock: 5 }]);
    await makeProduct(db.prisma, 'b', { stock: 1 });

    const error = await takeInTransaction([
      { product: 'p1', variant: 'v1', quantity: 2 },
      { product: 'b', quantity: 2 },
    ]).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect((error as InsufficientStockError).productId).toBe('b');
    expect((error as InsufficientStockError).variantId).toBeNull();
    expect(await variantStock('v1')).toBe(5);
    expect(await productStock('p1')).toBe(5);
    expect(await productStock('b')).toBe(1);
  });
});

describe('the lock order on a real database', () => {
  it('two orders on the same product, one with two sizes and one with a single size, never wait for each other', async () => {
    await makeShirt([
      { id: 'y', size: 'M', stock: 100 },
      { id: 'z', size: 'L', stock: 100 },
    ]);

    // 8 pairs = 16 transactions, below the 20 connections of the test pool.
    // Order 1 = y + z, order 2 = z. A product locked between y and z would make a pair wait for ever
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => [
        takeInTransaction([
          { product: 'p1', variant: 'y', quantity: 1 },
          { product: 'p1', variant: 'z', quantity: 1 },
        ]),
        takeInTransaction([{ product: 'p1', variant: 'z', quantity: 1 }]),
      ]).flat(),
    );

    // A deadlock shows here: Postgres stops one of the two with an error
    expect(rejectedOf(results).map((result) => result.reason)).toEqual([]);
    expect(await variantStock('y')).toBe(92);
    expect(await variantStock('z')).toBe(84);
    expect(await productStock()).toBe(176);
  });

  // The test above depends on luck. This one does not: it HOLDS a variant, so the function under
  // test must stop and wait, and then it checks which rows the function is holding while it waits
  it.each<
    [
      string,
      (tx: Prisma.TransactionClient, items: StoredItem[]) => Promise<void>,
    ]
  >([
    ['takeStock', takeStock],
    ['restoreStock', restoreStock],
  ])(
    '%s does not lock the product while it still waits for a variant',
    async (_name, run) => {
      await makeShirt([
        { id: 'y', size: 'M', stock: 5 },
        { id: 'z', size: 'L', stock: 5 },
      ]);

      let signalHeld!: () => void;
      const held = new Promise<void>((resolve) => {
        signalHeld = resolve;
      });
      let letGo!: () => void;
      const released = new Promise<void>((resolve) => {
        letGo = resolve;
      });

      // 1) Somebody holds the lock of variant z
      const holder = db.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id = ${'z'} FOR UPDATE`;
        signalHeld();
        await released;
      });
      await held;

      // 2) The function takes y, and then has to WAIT for z
      const working = db.prisma.$transaction((tx) =>
        run(tx, [
          { product: 'p1', variant: 'y', quantity: 1 },
          { product: 'p1', variant: 'z', quantity: 1 },
        ]),
      );
      await sleep(500);

      // 3) While it waits, the product must be free. NOWAIT fails at once if somebody holds the row
      const probe = await db.prisma
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${'p1'} FOR UPDATE NOWAIT`;
        })
        .then(
          () => 'free',
          () => 'locked',
        );

      letGo();
      await Promise.all([holder, working]);
      expect(probe).toBe('free');
    },
  );
});

describe('the admin saving variants on a real database', () => {
  const products = () => new ProductsService(db.prisma as never);

  it('lets two variants swap their sizes (the unique index never sees the same pair twice)', async () => {
    await makeShirt([
      { id: 'v1', size: 'M', color: 'Black', stock: 5 },
      { id: 'v2', size: 'S', color: 'Black', stock: 6 },
    ]);

    await products().updateProduct('p1', {
      variants: [
        { id: 'v1', size: 'S', color: 'Black', stock: 5 },
        { id: 'v2', size: 'M', color: 'Black', stock: 6 },
      ],
    } as never);

    const rows = await db.prisma.productVariant.findMany({
      where: { productId: 'p1' },
      orderBy: { sortOrder: 'asc' },
    });
    expect(rows.map((row) => [row.id, row.size, row.color, row.stock])).toEqual(
      [
        ['v1', 'S', 'Black', 5],
        ['v2', 'M', 'Black', 6],
      ],
    );
    expect(await productStock()).toBe(11);
  });

  it('frees the size of a variant that was removed, so a new variant can take it in the same request', async () => {
    await makeShirt([
      { id: 'v1', size: 'M', stock: 5 },
      { id: 'v2', size: 'S', stock: 6 },
    ]);

    await products().updateProduct('p1', {
      variants: [
        { id: 'v2', size: 'S', stock: 3 },
        { size: 'M', stock: 4 }, // no id: a new variant with the size the old one had
      ],
    } as never);

    const rows = await db.prisma.productVariant.findMany({
      where: { productId: 'p1' },
      orderBy: { sortOrder: 'asc' },
    });
    expect(rows.map((row) => [row.size, row.stock])).toEqual([
      ['S', 3],
      ['M', 4],
    ]);
    expect(await variantStock('v2')).toBe(3); // the one that stayed kept its id
    expect(await productStock()).toBe(7);
    await expectTotalToBeTheSumOfVariants();
  });

  it('stops showing an image on the variants when the product drops it, and keeps the others', async () => {
    await makeShirt([
      { id: 'v1', size: 'S', stock: 1, image: 'a.jpg' },
      { id: 'v2', size: 'M', stock: 1, image: imageOf('p1') }, // the main image
      { id: 'v3', size: 'L', stock: 1, image: 'b.jpg' },
    ]);
    await db.prisma.product.update({
      where: { id: 'p1' },
      data: { images: ['a.jpg', 'b.jpg'] },
    });

    await products().updateProduct('p1', { images: ['b.jpg'] } as never);

    const rows = await db.prisma.productVariant.findMany({
      where: { productId: 'p1' },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((row) => [row.id, row.image])).toEqual([
      ['v1', null], // a.jpg is gone
      ['v2', imageOf('p1')],
      ['v3', 'b.jpg'],
    ]);
    const product = await db.prisma.product.findUniqueOrThrow({
      where: { id: 'p1' },
    });
    expect(product.images).toEqual(['b.jpg']);
  });

  it('saves variants at the same moment as orders arrive: nobody waits for ever and the total stays the sum', async () => {
    await makeUser(db.prisma, 'u1');
    await makeShirt([
      { id: 'v1', size: 'M', stock: 100 },
      { id: 'v2', size: 'L', stock: 100 },
    ]);
    const orders = makeOrdersService();

    const bothSizes = () =>
      orders.createOrder(
        'u1',
        buyItems([
          { variant: 'v1', quantity: 1 },
          { variant: 'v2', quantity: 1 },
        ]),
      );
    const oneSize = () =>
      orders.createOrder('u1', buyItems([{ variant: 'v2', quantity: 1 }]));
    const adminSaves = () =>
      products().updateProduct('p1', {
        variants: [
          { id: 'v1', size: 'M', stock: 50 },
          { id: 'v2', size: 'L', stock: 50 },
        ],
      } as never);

    const results = await Promise.allSettled([
      ...Array.from({ length: 6 }, bothSizes),
      ...Array.from({ length: 4 }, oneSize),
      ...Array.from({ length: 3 }, adminSaves),
    ]);

    // A deadlock shows here: Postgres stops one of them with an error
    expect(rejectedOf(results).map((result) => result.reason)).toEqual([]);
    expect(await db.prisma.order.count()).toBe(10);
    // The admin writes absolute numbers and the orders subtract: whoever comes last, the product
    // must still hold the sum of its variants
    await expectTotalToBeTheSumOfVariants();
  });
});

// Only the database is real. Stripe, the background jobs and the coupons are fakes
function makeOrdersService() {
  const stripe = {
    client: {
      checkout: { sessions: { create: vi.fn() } },
      refunds: { create: vi.fn() },
    },
  };
  const inngest = { send: vi.fn().mockResolvedValue(undefined) };
  const cancellation = new OrderCancellationService(
    db.prisma as never,
    stripe as never,
  );
  return new OrdersService(
    db.prisma as never,
    stripe as never,
    inngest as never,
    cancellation,
    { resolve: vi.fn() } as never,
  );
}

// A cash order of "p1": each entry is one line of the cart (an option and its quantity)
const buyItems = (items: { variant: string; quantity: number }[]) =>
  ({
    items: items.map((item) => ({ product: 'p1', ...item })),
    shippingAddress: ADDRESS,
    paymentMethod: 'cash',
  }) as never;

describe('createOrder with variants on a real database', () => {
  it('two customers order the last unit of a size at the same moment: one gets it, the other is told it is gone', async () => {
    await makeUser(db.prisma, 'u1');
    await makeUser(db.prisma, 'u2');
    await makeShirt([
      { id: 'v1', size: 'M', color: 'Black', stock: 1 },
      { id: 'v2', size: 'L', color: 'Black', stock: 5 },
    ]);
    const service = makeOrdersService();

    const results = await Promise.allSettled([
      service.createOrder('u1', buyItems([{ variant: 'v1', quantity: 1 }])),
      service.createOrder('u2', buyItems([{ variant: 'v1', quantity: 1 }])),
    ]);

    const rejected = rejectedOf(results);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect((rejected[0].reason as Error).message).toMatch(
      /was just sold out|is out of stock/,
    );

    expect(await variantStock('v1')).toBe(0);
    expect(await variantStock('v2')).toBe(5); // the other size can still be sold
    expect(await productStock()).toBe(5);
    expect(await db.prisma.order.count()).toBe(1);
  });

  it('saves the chosen option on the order, with its label and its own image, and takes its stock', async () => {
    await makeUser(db.prisma, 'u1');
    await makeShirt([
      {
        id: 'v1',
        size: 'M',
        color: 'Black',
        stock: 5,
        image: 'https://placehold.co/p1-black.png',
      },
      { id: 'v2', size: 'L', color: 'Black', stock: 5 },
    ]);
    const service = makeOrdersService();

    const result = (await service.createOrder(
      'u1',
      buyItems([{ variant: 'v1', quantity: 2 }]),
    )) as { order: { id: string } };

    const saved = await db.prisma.order.findUniqueOrThrow({
      where: { id: result.order.id },
    });
    expect(saved.items).toEqual([
      {
        product: 'p1',
        variant: 'v1',
        variantLabel: 'M / Black',
        name: 'Product p1',
        image: 'https://placehold.co/p1-black.png',
        price: 10,
        quantity: 2,
      },
    ]);
    expect(await variantStock('v1')).toBe(3);
    expect(await productStock()).toBe(8);
    await expectTotalToBeTheSumOfVariants();
  });
});

describe('cancelling an order with variants on a real database', () => {
  const makeCancellation = () =>
    new OrderCancellationService(
      db.prisma as never,
      { client: { refunds: { create: vi.fn() } } } as never,
    );

  it('puts the variant back, and the total of its product with it', async () => {
    await makeUser(db.prisma, 'u1');
    await makeShirt([
      { id: 'v1', size: 'M', color: 'Black', stock: 8 },
      { id: 'v2', size: 'L', color: 'Black', stock: 10 },
    ]);
    await makeOrder(db.prisma, 'u1', 'o1', {
      items: [
        { ...line('p1', 2, 10), variant: 'v1', variantLabel: 'M / Black' },
      ],
    });

    await makeCancellation().cancel('o1', { by: 'admin' });

    expect(await variantStock('v1')).toBe(10);
    expect(await variantStock('v2')).toBe(10);
    expect(await productStock()).toBe(20);
    expect(
      (await db.prisma.order.findUniqueOrThrow({ where: { id: 'o1' } })).status,
    ).toBe('Cancelled');
    await expectTotalToBeTheSumOfVariants();
  });

  it('cancels fine when the variant was deleted since, and the total of the product does not grow', async () => {
    await makeUser(db.prisma, 'u1');
    await makeShirt([
      { id: 'v1', size: 'M', color: 'Black', stock: 8 },
      { id: 'v2', size: 'L', color: 'Black', stock: 10 },
    ]);
    await makeOrder(db.prisma, 'u1', 'o1', {
      items: [
        { ...line('p1', 2, 10), variant: 'gone', variantLabel: 'S / Red' },
      ],
    });

    await makeCancellation().cancel('o1', { by: 'admin' });

    expect(await variantStock('v1')).toBe(8);
    expect(await variantStock('v2')).toBe(10);
    expect(await productStock()).toBe(18);
    expect(
      (await db.prisma.order.findUniqueOrThrow({ where: { id: 'o1' } })).status,
    ).toBe('Cancelled');
  });
});

describe('the variant table of the migration', () => {
  const create = (size: string, color: string, productId = 'p1') =>
    db.prisma.productVariant.create({
      data: { productId, size, color, stock: 1 },
    });

  it('refuses the same size and colour twice on one product', async () => {
    await makeProduct(db.prisma, 'p1');
    await create('M', 'Black');

    const error = await create('M', 'Black').catch((caught: unknown) => caught);

    expect(error).toHaveProperty('code', 'P2002');
  });

  it('counts an empty size as a value: two colours-only variants of the same colour are the same', async () => {
    await makeProduct(db.prisma, 'p1');
    await create('', 'Black');

    const error = await create('', 'Black').catch((caught: unknown) => caught);

    expect(error).toHaveProperty('code', 'P2002');
  });

  it('accepts the same size in another colour, and the same pair on another product', async () => {
    await makeProduct(db.prisma, 'p1');
    await makeProduct(db.prisma, 'p2');

    await create('M', 'Black');
    await create('M', 'Red');
    await create('M', 'Black', 'p2');

    expect(await db.prisma.productVariant.count()).toBe(3);
  });

  it('deletes the variants together with their product', async () => {
    await makeProduct(db.prisma, 'p1');
    await create('M', 'Black');
    await create('L', 'Black');

    await db.prisma.product.delete({ where: { id: 'p1' } });

    expect(await db.prisma.productVariant.count()).toBe(0);
  });
});
