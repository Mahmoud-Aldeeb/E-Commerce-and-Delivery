import { describe, expect, it, vi } from 'vitest';
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

const watch = {
  id: 'p1',
  name: 'Watch',
  image: 'watch.png',
  price: 10,
  stock: 20,
};
const mat = { id: 'p2', name: 'Mat', image: 'mat.png', price: 5, stock: 20 };

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
  };
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ phone }) },
    product: { findMany: vi.fn().mockResolvedValue(products) },
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
