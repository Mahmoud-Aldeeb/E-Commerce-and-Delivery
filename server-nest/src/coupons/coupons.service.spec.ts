import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CouponsService } from './coupons.service.js';

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

// What an order that holds a use of a coupon looks like to the database
const REDEEMING = {
  status: { not: 'Cancelled' },
  NOT: [{ paymentMethod: 'card', isPaid: false }],
};

const coupon = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  code: 'WELCOME10',
  type: 'PERCENT',
  value: 10,
  maxDiscount: null,
  minSubtotal: null,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  perUserLimit: null,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

function setup() {
  const prisma = {
    coupon: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    order: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    product: { findMany: vi.fn() },
  };
  return { service: new CouponsService(prisma as never), prisma };
}

describe('resolve', () => {
  it('looks the code up capitalized and trimmed', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon());

    await service.resolve('u1', ' welcome10 ', 30);

    expect(prisma.coupon.findUnique).toHaveBeenCalledWith({
      where: { code: 'WELCOME10' },
    });
  });

  it('refuses a code that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.resolve('u1', 'NOPE', 30));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'This code is not valid');
  });

  it('refuses a blank code without asking the database', async () => {
    const { service, prisma } = setup();

    const error = await failureOf(service.resolve('u1', '   ', 30));

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('works out the discount from the items', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon());

    const result = await service.resolve('u1', 'WELCOME10', 30);

    expect(result).toEqual({
      couponId: 'c1',
      code: 'WELCOME10',
      type: 'PERCENT',
      value: 10,
      discount: 3,
    });
  });

  it('counts only the orders that really hold a use: not cancelled, and paid if by card', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon());

    await service.resolve('u1', 'WELCOME10', 30);

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { couponId: 'c1', ...REDEEMING },
    });
    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { couponId: 'c1', userId: 'u1', ...REDEEMING },
    });
  });

  it('refuses when the total limit is already reached', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon({ usageLimit: 1 }));
    // The first count is for everybody (1 use), the second for this customer (0)
    prisma.order.count.mockImplementation(
      async ({ where }: { where: { userId?: string } }) =>
        where.userId ? 0 : 1,
    );

    const error = await failureOf(service.resolve('u1', 'WELCOME10', 30));

    expect(error).toHaveProperty(
      'message',
      'This code has reached its usage limit',
    );
  });

  it('refuses a customer who already used it', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon({ perUserLimit: 1 }));
    prisma.order.count.mockResolvedValue(1);

    const error = await failureOf(service.resolve('u1', 'WELCOME10', 30));

    expect(error).toHaveProperty('message', 'You have already used this code');
  });
});

describe('validate', () => {
  it('prices the items from the database and gives the totals with the discount', async () => {
    const { service, prisma } = setup();
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', price: 10 },
      { id: 'p2', price: 5 },
    ]);
    prisma.coupon.findUnique.mockResolvedValue(coupon());

    const result = await service.validate('u1', {
      code: 'WELCOME10',
      items: [
        { product: 'p1', quantity: 2 },
        { product: 'p2', quantity: 2 },
      ],
    });

    // 2 x 10 + 2 x 5 = 30. 10% off = 3. 27 is above 20, so delivery is free. Tax: 27 x 8% = 2.16
    expect(result).toEqual({
      coupon: { code: 'WELCOME10', type: 'PERCENT', value: 10 },
      totals: {
        subtotal: 30,
        discount: 3,
        deliveryFee: 0,
        tax: 2.16,
        total: 29.16,
      },
    });
  });

  it('refuses when a product no longer exists, before looking at the code', async () => {
    const { service, prisma } = setup();
    prisma.product.findMany.mockResolvedValue([]);

    const error = await failureOf(
      service.validate('u1', {
        code: 'WELCOME10',
        items: [{ product: 'gone', quantity: 1 }],
      }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'A product in your cart is no longer available',
    );
    expect(prisma.coupon.findUnique).not.toHaveBeenCalled();
  });
});

describe('createCoupon', () => {
  const dto = { code: 'SAVE5', type: 'FIXED' as const, value: 5 };

  it('saves it with empty limits and turned on by default', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(null);
    prisma.coupon.create.mockImplementation(
      async ({ data }: { data: object }) => coupon({ ...data }),
    );

    const result = await service.createCoupon(dto);

    expect(prisma.coupon.create).toHaveBeenCalledWith({
      data: {
        code: 'SAVE5',
        type: 'FIXED',
        value: 5,
        maxDiscount: null,
        minSubtotal: null,
        startsAt: null,
        expiresAt: null,
        usageLimit: null,
        perUserLimit: null,
        isActive: true,
      },
    });
    expect(result.coupon.redeemedCount).toBe(0);
  });

  it('refuses a code that exists', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue({ id: 'c9' });

    const error = await failureOf(service.createCoupon(dto));

    expect(error).toBeInstanceOf(ConflictException);
    expect(prisma.coupon.create).not.toHaveBeenCalled();
  });

  it('refuses a percentage above 100', async () => {
    const { service, prisma } = setup();

    const error = await failureOf(
      service.createCoupon({ code: 'BIG', type: 'PERCENT', value: 150 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty(
      'message',
      'A percentage cannot be more than 100',
    );
    expect(prisma.coupon.create).not.toHaveBeenCalled();
  });

  it('refuses a maximum discount on a fixed coupon', async () => {
    const { service } = setup();

    const error = await failureOf(
      service.createCoupon({ ...dto, maxDiscount: 10 }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('refuses an end date that is not after the start date', async () => {
    const { service } = setup();
    const day = new Date('2026-11-01T00:00:00.000Z');

    const error = await failureOf(
      service.createCoupon({ ...dto, startsAt: day, expiresAt: day }),
    );

    expect(error).toHaveProperty(
      'message',
      'The end date must be after the start date',
    );
  });
});

describe('updateCoupon', () => {
  it('answers "not found" for a coupon that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(null);

    const error = await failureOf(
      service.updateCoupon('c1', { isActive: false }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(prisma.coupon.update).not.toHaveBeenCalled();
  });

  it('changes only what was sent and keeps the rest', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon({ usageLimit: 50 }));
    prisma.coupon.update.mockResolvedValue(
      coupon({ usageLimit: 50, isActive: false }),
    );

    await service.updateCoupon('c1', { isActive: false });

    expect(prisma.coupon.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        type: 'PERCENT',
        value: 10,
        maxDiscount: null,
        minSubtotal: null,
        startsAt: null,
        expiresAt: null,
        usageLimit: 50,
        perUserLimit: null,
        isActive: false,
      },
    });
  });

  it('clears a limit when null is sent', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon({ usageLimit: 50 }));
    prisma.coupon.update.mockResolvedValue(coupon());

    await service.updateCoupon('c1', { usageLimit: null });

    expect(prisma.coupon.update.mock.calls[0][0].data.usageLimit).toBeNull();
  });

  it('checks the final state: a percentage cannot become fixed while it keeps a maximum discount', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon({ maxDiscount: 20 }));

    const error = await failureOf(
      service.updateCoupon('c1', { type: 'FIXED' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(prisma.coupon.update).not.toHaveBeenCalled();
  });

  it('lets it become fixed once the maximum is cleared', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(coupon({ maxDiscount: 20 }));
    prisma.coupon.update.mockResolvedValue(coupon({ type: 'FIXED', value: 5 }));

    await service.updateCoupon('c1', {
      type: 'FIXED',
      value: 5,
      maxDiscount: null,
    });

    expect(prisma.coupon.update).toHaveBeenCalledTimes(1);
  });
});

describe('deleteCoupon', () => {
  it('answers "not found" for a coupon that does not exist', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue(null);

    const error = await failureOf(service.deleteCoupon('c1'));

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it.each([
    [1, 'This coupon appears on 1 order. Deactivate it instead'],
    [3, 'This coupon appears on 3 orders. Deactivate it instead'],
  ])('keeps a coupon that appears on %i order(s)', async (count, message) => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.order.count.mockResolvedValue(count);

    const error = await failureOf(service.deleteCoupon('c1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error).toHaveProperty('message', message);
    expect(prisma.coupon.delete).not.toHaveBeenCalled();
  });

  it('deletes a coupon that no order used', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findUnique.mockResolvedValue({ id: 'c1' });

    const result = await service.deleteCoupon('c1');

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { couponId: 'c1' },
    });
    expect(prisma.coupon.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(result).toEqual({ message: 'Coupon deleted' });
  });
});

describe('getCoupons', () => {
  it('lists the coupons with how many orders hold a use of each', async () => {
    const { service, prisma } = setup();
    prisma.coupon.findMany.mockResolvedValue([
      coupon(),
      coupon({ id: 'c2', code: 'SAVE5' }),
    ]);
    prisma.order.groupBy.mockResolvedValue([
      { couponId: 'c1', _count: { _all: 4 } },
    ]);

    const result = await service.getCoupons();

    expect(prisma.order.groupBy).toHaveBeenCalledWith({
      by: ['couponId'],
      where: { couponId: { not: null }, ...REDEEMING },
      _count: { _all: true },
    });
    expect(
      result.coupons.map((item) => [item.code, item.redeemedCount]),
    ).toEqual([
      ['WELCOME10', 4],
      ['SAVE5', 0],
    ]);
  });
});
