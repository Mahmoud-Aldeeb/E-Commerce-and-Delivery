import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../stripe/stripe.service.js', () => ({
  StripeService: class StripeService {},
}));
vi.mock('../inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
}));
vi.mock('./order-cancellation.service.js', () => ({
  OrderCancellationService: class OrderCancellationService {},
}));
vi.mock('../coupons/coupons.service.js', () => ({
  CouponsService: class CouponsService {},
}));

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// `variants: []` = a product without options. The real database always gives this list,
// because createOrder asks for it
const watch = {
  id: 'p1',
  name: 'Watch',
  image: 'watch.png',
  price: 10,
  stock: 20,
  variants: [],
};
const mat = {
  id: 'p2',
  name: 'Mat',
  image: 'mat.png',
  price: 5,
  stock: 20,
  variants: [],
};

// A product with options: its stock (15) is the total of its variants (10 + 5)
const shirt = {
  id: 'p3',
  name: 'Shirt',
  image: 'shirt.png',
  price: 20,
  stock: 15,
  variants: [
    {
      id: 'v1',
      size: 'M',
      color: 'Black',
      stock: 10,
      image: 'shirt-black.png',
    },
    { id: 'v2', size: 'L', color: 'Black', stock: 5, image: null },
  ],
};
const address = {
  label: 'Home',
  address: '12 Nile St',
  city: 'Cairo',
  state: 'Cairo',
  zip: '11511',
  lat: 30,
  lng: 31,
};

const makeDto = (overrides: Record<string, unknown> = {}) =>
  ({
    items: [{ product: 'p1', quantity: 2 }],
    shippingAddress: address,
    paymentMethod: 'cash',
    ...overrides,
  }) as never;

function setup(
  products: object[] = [watch, mat],
  phone: string | null = '+20 101 234 5678',
) {
  const tx = {
    order: {
      create: vi.fn(async ({ data }: { data: object }) => ({
        id: 'o1',
        ...data,
      })),
    },
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ phone }) },
    product: { findMany: vi.fn().mockResolvedValue(products) },
    order: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
  };
  const sessionsCreate = vi
    .fn()
    .mockResolvedValue({ url: 'https://stripe.test/pay' });
  const stripe = {
    client: { checkout: { sessions: { create: sessionsCreate } } },
  };
  const inngest = { send: vi.fn().mockResolvedValue(undefined) };
  const coupons = { resolve: vi.fn() };

  const service = new OrdersService(
    prisma as never,
    stripe as never,
    inngest as never,
    {} as never,
    coupons as never,
  );
  return { service, tx, prisma, sessionsCreate, inngest, coupons };
}

describe('createOrder: the totals', () => {
  it('prices the order from the database and saves the totals (no coupon)', async () => {
    const { service, tx, coupons } = setup();

    await service.createOrder('u1', makeDto(), 'https://shop.example');

    expect(coupons.resolve).not.toHaveBeenCalled();
    // 2 x 10 = 20: exactly 20 still pays delivery
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        paymentMethod: 'cash',
        subtotal: 20,
        discount: 0,
        deliveryFee: 1.99,
        tax: 1.6,
        total: 23.59,
        couponId: null,
        couponCode: null,
      }),
    });
  });

  it('applies a coupon: the discount comes from the coupon service, the rest is worked out from it', async () => {
    const { service, tx, coupons } = setup();
    coupons.resolve.mockResolvedValue({
      couponId: 'c1',
      code: 'SAVE5',
      discount: 5,
    });

    await service.createOrder(
      'u1',
      makeDto({
        items: [{ product: 'p1', quantity: 3 }],
        couponCode: ' save5 ',
      }),
      'https://shop.example',
    );

    // The code goes as it was typed (the coupon service cleans it) with the items total: 3 x 10 = 30
    expect(coupons.resolve).toHaveBeenCalledWith('u1', ' save5 ', 30);
    // 30 - 5 = 25: above 20, so delivery is free. Tax: 25 x 8% = 2
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subtotal: 30,
        discount: 5,
        deliveryFee: 0,
        tax: 2,
        total: 27,
        couponId: 'c1',
        couponCode: 'SAVE5',
      }),
    });
  });

  it('charges delivery when the coupon brings the items down to 20 or less', async () => {
    const { service, tx, coupons } = setup();
    coupons.resolve.mockResolvedValue({
      couponId: 'c1',
      code: 'SAVE10',
      discount: 10,
    });

    await service.createOrder(
      'u1',
      makeDto({
        items: [{ product: 'p2', quantity: 5 }],
        couponCode: 'SAVE10',
      }),
    );

    // 5 x 5 = 25. 25 - 10 = 15. Tax: 15 x 8% = 1.2. Total: 15 + 1.99 + 1.2 = 18.19
    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subtotal: 25,
        discount: 10,
        deliveryFee: 1.99,
        tax: 1.2,
        total: 18.19,
      }),
    });
  });

  it('ignores a coupon code that is only spaces', async () => {
    const { service, tx, coupons } = setup();

    await service.createOrder('u1', makeDto({ couponCode: '   ' }));

    expect(coupons.resolve).not.toHaveBeenCalled();
    expect(tx.order.create.mock.calls[0][0].data).toMatchObject({
      discount: 0,
      couponId: null,
    });
  });

  it('stops before saving anything when the coupon is not valid', async () => {
    const { service, tx, prisma, sessionsCreate, coupons } = setup();
    coupons.resolve.mockRejectedValue(
      new BadRequestException('This code has expired'),
    );

    const error = await failureOf(
      service.createOrder('u1', makeDto({ couponCode: 'OLD' })),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'This code has expired');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe('createOrder: payment', () => {
  it('sends a card order to Stripe for exactly the total, and does not take the stock yet', async () => {
    const { service, tx, sessionsCreate, inngest } = setup();

    const result = await service.createOrder(
      'u1',
      makeDto({ paymentMethod: 'card' }),
      'https://shop.example',
    );

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        success_url: 'https://shop.example/orders/o1?clearCart=true',
        cancel_url: 'https://shop.example/checkout',
        metadata: { orderId: 'o1' },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: 'Order payment' },
              unit_amount: 2359, // 23.59 dollars, in cents
            },
            quantity: 1,
          },
        ],
      }),
    );
    expect(result).toEqual({ url: 'https://stripe.test/pay' });
    // The stock is taken when Stripe confirms the payment (the webhook)
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('takes the stock of a cash order at once and sends the events', async () => {
    const { service, tx, inngest } = setup();

    const result = await service.createOrder('u1', makeDto());

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(inngest.send).toHaveBeenCalledWith([
      { name: 'inventory/stock.updated', data: { productId: 'p1' } },
      { name: 'order/placed', data: { orderId: 'o1' } },
    ]);
    expect(result).toEqual({
      order: expect.objectContaining({ id: 'o1', total: 23.59 }),
    });
  });
});

describe('createOrder: the checks before the order exists', () => {
  it('needs a phone number for the courier', async () => {
    const { service, prisma, tx } = setup([watch], null);

    const error = await failureOf(service.createOrder('u1', makeDto()));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'Add a phone number so the courier can reach you',
    );
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('refuses a product that no longer exists', async () => {
    const { service, tx } = setup([]);

    const error = await failureOf(service.createOrder('u1', makeDto()));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('says how many are left when there is less stock than asked', async () => {
    const { service } = setup([{ ...watch, stock: 1 }]);

    const error = await failureOf(service.createOrder('u1', makeDto()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty('message', 'Only 1 left of "Watch"');
  });

  it('says when a product is out of stock', async () => {
    const { service } = setup([{ ...watch, stock: 0 }]);

    const error = await failureOf(service.createOrder('u1', makeDto()));

    expect(error).toHaveProperty('message', '"Watch" is out of stock');
  });

  it('turns "sold out in the meantime" into a clear answer, and saves no order', async () => {
    const { service, tx } = setup();
    tx.product.updateMany.mockResolvedValue({ count: 0 }); // somebody took the last one first

    const error = await failureOf(service.createOrder('u1', makeDto()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty('message', '"Watch" was just sold out');
  });
});
describe('createOrder: products with options (size, colour)', () => {
  // One line of the cart: the shirt, with the option the customer chose (or none)
  const buy = (variant?: string, quantity = 1) =>
    makeDto({ items: [{ product: 'p3', quantity, variant }] });

  // The shirt, with only its first option, and that option has this stock
  const shirtWithStock = (stock: number) => ({
    ...shirt,
    variants: [{ ...shirt.variants[0], stock }],
  });

  it('refuses a product with options when no option was chosen', async () => {
    const { service, tx } = setup([shirt]);

    const error = await failureOf(service.createOrder('u1', buy()));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'Choose the options of "Shirt"');
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('refuses an option that is not one of the product (it was changed or deleted)', async () => {
    const { service, tx } = setup([shirt]);

    const error = await failureOf(service.createOrder('u1', buy('gone')));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'The options of "Shirt" changed. Please add it to your cart again',
    );
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('refuses an option sent for a product that has none', async () => {
    const { service } = setup([watch]);

    const error = await failureOf(
      service.createOrder(
        'u1',
        makeDto({ items: [{ product: 'p1', quantity: 1, variant: 'v1' }] }),
      ),
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'The options of "Watch" changed. Please add it to your cart again',
    );
  });

  it('checks the stock of the OPTION, not the total of the product', async () => {
    const { service } = setup([shirt]); // the product has 15, the option L only 5

    const error = await failureOf(service.createOrder('u1', buy('v2', 6)));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      'Only 5 left of "Shirt (L / Black)"',
    );
  });

  it('says when an option is out of stock', async () => {
    const { service } = setup([shirtWithStock(0)]);

    const error = await failureOf(service.createOrder('u1', buy('v1')));

    expect(error).toHaveProperty(
      'message',
      '"Shirt (M / Black)" is out of stock',
    );
  });

  it('saves the option on the order, with its label and its own image', async () => {
    const { service, tx } = setup([shirt]);

    await service.createOrder('u1', buy('v1', 2));

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subtotal: 40,
        items: [
          {
            product: 'p3',
            variant: 'v1',
            variantLabel: 'M / Black',
            name: 'Shirt',
            image: 'shirt-black.png',
            price: 20,
            quantity: 2,
          },
        ],
      }),
    });
  });

  it('uses the image of the product when the option has no image of its own', async () => {
    const { service, tx } = setup([shirt]);

    await service.createOrder('u1', buy('v2'));

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        items: [expect.objectContaining({ variant: 'v2', image: 'shirt.png' })],
      }),
    });
  });

  it('takes the stock of the option, and the total of the product with it (cash)', async () => {
    const { service, tx } = setup([shirt]);

    await service.createOrder('u1', buy('v1', 2));

    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', productId: 'p3', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p3' },
      data: { stock: { decrement: 2 } },
    });
  });

  it('names the option when it was sold out in the meantime', async () => {
    const { service, tx } = setup([shirt]);
    tx.productVariant.updateMany.mockResolvedValue({ count: 0 }); // somebody took the last one first

    const error = await failureOf(service.createOrder('u1', buy('v1')));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty(
      'message',
      '"Shirt (M / Black)" was just sold out',
    );
  });

  it('sends ONE stock event for a product bought in two sizes', async () => {
    const { service, inngest } = setup([shirt]);

    await service.createOrder(
      'u1',
      makeDto({
        items: [
          { product: 'p3', quantity: 1, variant: 'v1' },
          { product: 'p3', quantity: 1, variant: 'v2' },
        ],
      }),
    );

    expect(inngest.send).toHaveBeenCalledWith([
      { name: 'inventory/stock.updated', data: { productId: 'p3' } },
      { name: 'order/placed', data: { orderId: 'o1' } },
    ]);
  });
});

describe('getOrder: the arrival estimate', () => {
  const NOW = new Date('2026-11-01T10:00:00.000Z');
  const KM_PER_DEGREE = (Math.PI / 180) * 6371;
  const tenSecondsAgo = new Date(NOW.getTime() - 10_000).toISOString();

  // The time is frozen: the estimate depends on how old the location of the courier is
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // The customer is at (30, 31) and the courier is 6 km north of there, on a scooter
  const onItsWay = (overrides: Record<string, unknown> = {}) => ({
    id: 'o1',
    userId: 'u1',
    status: 'Out for Delivery',
    shippingAddress: { lat: 30, lng: 31 },
    liveLocation: {
      lat: 30 + 6 / KM_PER_DEGREE,
      lng: 31,
      updatedAt: tenSecondsAgo,
    },
    deliveryPartner: { name: 'Omar', vehicleType: 'scooter' },
    ...overrides,
  });

  it('adds the arrival estimate while the order is out for delivery', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(onItsWay());

    const { order } = await service.getOrder('u1', 'o1');

    expect(order).toMatchObject({ id: 'o1', status: 'Out for Delivery' });
    expect(order.eta).toEqual({
      minutes: 24,
      minMinutes: 18,
      maxMinutes: 30,
      distanceKm: 6,
      locationUpdatedAt: tenSecondsAgo,
    });
  });

  it.each([['Placed'], ['Assigned'], ['Packed'], ['Delivered'], ['Cancelled']])(
    'gives no estimate when the order is %s',
    async (status) => {
      const { service, prisma } = setup();
      prisma.order.findFirst.mockResolvedValue(onItsWay({ status }));

      const { order } = await service.getOrder('u1', 'o1');

      expect(order.eta).toBeNull();
    },
  );

  it('gives no estimate when the location of the courier is old', async () => {
    const { service, prisma } = setup();
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    prisma.order.findFirst.mockResolvedValue(
      onItsWay({
        liveLocation: { lat: 30.05, lng: 31, updatedAt: fiveMinutesAgo },
      }),
    );

    const { order } = await service.getOrder('u1', 'o1');

    expect(order.eta).toBeNull();
  });

  it('gives no estimate when the courier has not shared a location', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(onItsWay({ liveLocation: null }));

    const { order } = await service.getOrder('u1', 'o1');

    expect(order.eta).toBeNull();
  });

  it("looks the order up by its owner, so another user's order is not found", async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(null);

    const error = await failureOf(service.getOrder('u2', 'o1'));

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1', userId: 'u2' } }),
    );
  });
});

describe('updateOrderStatus: the moment of delivery', () => {
  const NOW = new Date('2026-11-01T10:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const active = { id: 'o1', status: 'Out for Delivery', statusHistory: [] };

  it('records the moment when an admin marks an order Delivered (it counts like a delivery by the courier)', async () => {
    const { service, prisma } = setup();
    prisma.order.findUnique.mockResolvedValue(active);
    prisma.order.update.mockResolvedValue({ id: 'o1' });

    await service.updateOrderStatus('o1', { status: 'Delivered' } as never);

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: expect.objectContaining({ status: 'Delivered', deliveredAt: NOW }),
    });
  });

  it('records no moment for the other statuses', async () => {
    const { service, prisma } = setup();
    prisma.order.findUnique.mockResolvedValue({ ...active, status: 'Packed' });
    prisma.order.update.mockResolvedValue({ id: 'o1' });

    await service.updateOrderStatus('o1', {
      status: 'Out for Delivery',
    } as never);

    expect(prisma.order.update.mock.calls[0][0].data).not.toHaveProperty(
      'deliveredAt',
    );
  });

  it('refuses an order that is already finished', async () => {
    const { service, prisma } = setup();
    prisma.order.findUnique.mockResolvedValue({
      ...active,
      status: 'Delivered',
    });

    const error = await failureOf(
      service.updateOrderStatus('o1', { status: 'Delivered' } as never),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
