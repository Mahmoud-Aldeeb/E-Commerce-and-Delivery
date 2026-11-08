import { describe, expect, it } from 'vitest';
import {
  availableLines,
  calculateReturnRefund,
  canMove,
  checkEligibility,
  cleanReturnSearch,
  parseLines,
  planReturn,
  refundStatusOf,
  type ReturnLine,
  type ReturnStatus,
} from './return-rules.js';

// A line as an order stores it (JSON)
const stored = (
  product: string,
  quantity: number,
  price = 10,
  extra: Record<string, unknown> = {},
) => ({
  product,
  name: `Product ${product}`,
  image: `${product}.png`,
  price,
  quantity,
  ...extra,
});

// A line as the rules give it
const line = (
  product: string,
  quantity: number,
  price = 10,
  extra: Partial<ReturnLine> = {},
): ReturnLine => ({
  product,
  variant: null,
  variantLabel: null,
  name: `Product ${product}`,
  image: `${product}.png`,
  price,
  quantity,
  ...extra,
});

describe('parseLines', () => {
  it('reads the lines an order stored, with their option', () => {
    const result = parseLines([
      stored('a', 2, 20, {
        variant: 'v1',
        variantLabel: 'M / Black',
        name: 'Shirt',
      }),
    ]);

    expect(result).toEqual([
      {
        product: 'a',
        variant: 'v1',
        variantLabel: 'M / Black',
        name: 'Shirt',
        image: 'a.png',
        price: 20,
        quantity: 2,
      },
    ]);
  });

  it('gives a line without options a null option and a null label', () => {
    expect(parseLines([stored('a', 1)])).toEqual([line('a', 1)]);
  });

  it('joins the same product and option into one line', () => {
    const result = parseLines([stored('a', 1), stored('a', 2)]);

    expect(result).toEqual([line('a', 3)]);
  });

  it('keeps two options of the same product apart', () => {
    const result = parseLines([
      stored('a', 1, 10, { variant: 'v1' }),
      stored('a', 1, 10, { variant: 'v2' }),
    ]);

    expect(result.map((item) => item.variant)).toEqual(['v1', 'v2']);
  });

  it('treats an empty option like no option', () => {
    const result = parseLines([
      stored('a', 1, 10, { variant: '' }),
      stored('a', 2, 10, { variant: null }),
    ]);

    expect(result).toEqual([line('a', 3)]);
  });

  it('skips a line that does not look right', () => {
    const result = parseLines([
      null,
      'text',
      { product: 7, quantity: 1, price: 10 },
      stored('a', 0),
      stored('a', -1),
      stored('a', 1.5),
      { product: 'a', quantity: 1 }, // no price
      stored('a', 1, -5),
      stored('ok', 4),
    ]);

    expect(result).toEqual([line('ok', 4)]);
  });

  it('gives an empty list when what was stored is not a list', () => {
    expect(parseLines(null)).toEqual([]);
    expect(parseLines(undefined)).toEqual([]);
    expect(parseLines({ product: 'a', quantity: 1, price: 1 })).toEqual([]);
    expect(parseLines('items')).toEqual([]);
  });

  it('fills a missing name and a missing image', () => {
    const result = parseLines([{ product: 'a', quantity: 1, price: 10 }]);

    expect(result[0]).toMatchObject({ name: 'Product', image: '' });
  });
});

describe('availableLines', () => {
  it('is everything that was ordered when nothing was returned', () => {
    const result = availableLines([line('a', 2), line('b', 1)], []);

    expect(
      result.map((item) => [
        item.product,
        item.ordered,
        item.returned,
        item.available,
      ]),
    ).toEqual([
      ['a', 2, 0, 2],
      ['b', 1, 0, 1],
    ]);
  });

  it('takes away what the active returns hold, from every return', () => {
    const result = availableLines(
      [line('a', 3)],
      [[stored('a', 1)], [stored('a', 1)]],
    );

    expect(result[0]).toMatchObject({ ordered: 3, returned: 2, available: 1 });
  });

  it('keeps the options apart', () => {
    const result = availableLines(
      [
        line('a', 2, 10, { variant: 'v1' }),
        line('a', 2, 10, { variant: 'v2' }),
      ],
      [[stored('a', 1, 10, { variant: 'v1' })]],
    );

    expect(result.map((item) => item.available)).toEqual([1, 2]);
  });

  it('never goes below zero', () => {
    const result = availableLines([line('a', 1)], [[stored('a', 5)]]);

    expect(result[0].available).toBe(0);
  });
});

describe('planReturn', () => {
  const order = [line('a', 2, 20), line('b', 1, 5)];

  it('gives the chosen lines with the quantity that is returned, and their value', () => {
    const plan = planReturn(order, [], [{ product: 'a', quantity: 1 }]);

    expect(plan).toEqual({
      ok: true,
      lines: [line('a', 1, 20)],
      itemsValue: 20,
      completesOrder: false,
    });
  });

  it('is not the whole order while units are left', () => {
    const plan = planReturn(order, [], [{ product: 'a', quantity: 2 }]);

    expect(plan).toMatchObject({
      ok: true,
      itemsValue: 40,
      completesOrder: false,
    });
  });

  it('completes the order when every unit is asked for', () => {
    const plan = planReturn(
      order,
      [],
      [
        { product: 'a', quantity: 2 },
        { product: 'b', quantity: 1 },
      ],
    );

    expect(plan).toMatchObject({
      ok: true,
      itemsValue: 45,
      completesOrder: true,
    });
  });

  it('completes the order when the earlier returns hold the rest', () => {
    const plan = planReturn(
      order,
      [[stored('a', 1, 20)]],
      [
        { product: 'a', quantity: 1 },
        { product: 'b', quantity: 1 },
      ],
    );

    expect(plan).toMatchObject({ ok: true, completesOrder: true });
  });

  it('joins the same item sent twice', () => {
    const plan = planReturn(
      order,
      [],
      [
        { product: 'a', quantity: 1 },
        { product: 'a', quantity: 1 },
      ],
    );

    expect(plan).toMatchObject({
      ok: true,
      lines: [line('a', 2, 20)],
      itemsValue: 40,
    });
  });

  it('treats an empty option like no option', () => {
    const plan = planReturn(
      order,
      [],
      [{ product: 'a', variant: '', quantity: 1 }],
    );

    expect(plan).toMatchObject({ ok: true, itemsValue: 20 });
  });

  it('refuses when nothing is chosen', () => {
    expect(planReturn(order, [], [])).toEqual({
      ok: false,
      message: 'Choose at least one item to return',
    });
  });

  it('refuses an item that is not in the order', () => {
    expect(planReturn(order, [], [{ product: 'zzz', quantity: 1 }])).toEqual({
      ok: false,
      message: 'One of the items is not in this order',
    });
  });

  it('refuses more than what is left, and says how many are', () => {
    const plan = planReturn(
      [line('a', 2, 20)],
      [[stored('a', 1, 20)]],
      [{ product: 'a', quantity: 2 }],
    );

    expect(plan).toEqual({
      ok: false,
      message: 'Only 1 of "Product a" can still be returned',
    });
  });

  it('says when the item is already fully in other returns', () => {
    const plan = planReturn(
      [line('a', 2, 20)],
      [[stored('a', 2, 20)]],
      [{ product: 'a', quantity: 1 }],
    );

    expect(plan).toEqual({
      ok: false,
      message: '"Product a" is already being returned',
    });
  });

  it('names the option in its messages', () => {
    const plan = planReturn(
      [
        line('a', 2, 10, {
          variant: 'v1',
          variantLabel: 'M / Black',
          name: 'Shirt',
        }),
      ],
      [],
      [{ product: 'a', variant: 'v1', quantity: 3 }],
    );

    expect(plan).toEqual({
      ok: false,
      message: 'Only 2 of "Shirt (M / Black)" can still be returned',
    });
  });

  it('rounds the value to cents', () => {
    const plan = planReturn(
      [line('a', 3, 3.33)],
      [],
      [{ product: 'a', quantity: 3 }],
    );

    expect(plan).toMatchObject({ ok: true, itemsValue: 9.99 });
  });
});

describe('calculateReturnRefund', () => {
  it('gives the share of the items, with their share of the tax', () => {
    // 2 items of $20: subtotal 40, tax 3.20, total 43.20. One of them is half of the order
    const refund = calculateReturnRefund({
      orderSubtotal: 40,
      orderTotal: 43.2,
      orderDeliveryFee: 0,
      itemsValue: 20,
      reserved: 0,
      completesOrder: false,
    });

    expect(refund).toBe(21.6);
  });

  it('spreads the discount over the items', () => {
    // 3 items of $10, a $5 discount: pays 25, free delivery, tax 2, total 27. One item = a third of 27
    const refund = calculateReturnRefund({
      orderSubtotal: 30,
      orderTotal: 27,
      orderDeliveryFee: 0,
      itemsValue: 10,
      reserved: 0,
      completesOrder: false,
    });

    expect(refund).toBe(9);
  });

  it('does not give the delivery back', () => {
    // 3 items of $5: subtotal 15, delivery 1.99, tax 1.20, total 18.19. What can come back is 16.20
    const refund = calculateReturnRefund({
      orderSubtotal: 15,
      orderTotal: 18.19,
      orderDeliveryFee: 1.99,
      itemsValue: 5,
      reserved: 0,
      completesOrder: false,
    });

    expect(refund).toBe(5.4);
  });

  it('gives everything that can come back for the whole order, and the delivery stays', () => {
    const refund = calculateReturnRefund({
      orderSubtotal: 15,
      orderTotal: 18.19,
      orderDeliveryFee: 1.99,
      itemsValue: 15,
      reserved: 0,
      completesOrder: true,
    });

    expect(refund).toBe(16.2);
  });

  it('gives the return that completes the order exactly what is left, to the cent', () => {
    const refund = calculateReturnRefund({
      orderSubtotal: 40,
      orderTotal: 40,
      orderDeliveryFee: 0,
      itemsValue: 14.45,
      reserved: 25.55,
      completesOrder: true,
    });

    expect(refund).toBe(14.45);
  });

  it('three returns of one unit give back exactly what can come back', () => {
    // 3 items of $3.33: subtotal 9.99, delivery 1.99, tax 0.80, total 12.78. What can come back is 10.79
    const base = {
      orderSubtotal: 9.99,
      orderTotal: 12.78,
      orderDeliveryFee: 1.99,
      itemsValue: 3.33,
    };

    const first = calculateReturnRefund({
      ...base,
      reserved: 0,
      completesOrder: false,
    });
    const second = calculateReturnRefund({
      ...base,
      reserved: first,
      completesOrder: false,
    });
    const third = calculateReturnRefund({
      ...base,
      reserved: first + second,
      completesOrder: true,
    });

    expect([first, second, third]).toEqual([3.6, 3.6, 3.59]);
  });

  it('never gives more than what is left', () => {
    const refund = calculateReturnRefund({
      orderSubtotal: 10,
      orderTotal: 10,
      orderDeliveryFee: 0,
      itemsValue: 0.02,
      reserved: 9.99,
      completesOrder: false,
    });

    expect(refund).toBe(0.01);
  });

  it('treats a missing delivery fee as zero', () => {
    const refund = calculateReturnRefund({
      orderSubtotal: 10,
      orderTotal: 10,
      orderDeliveryFee: null,
      itemsValue: 5,
      reserved: 0,
      completesOrder: false,
    });

    expect(refund).toBe(5);
  });

  it('is zero for an order with no items value', () => {
    const refund = calculateReturnRefund({
      orderSubtotal: 0,
      orderTotal: 5,
      orderDeliveryFee: 0,
      itemsValue: 0,
      reserved: 0,
      completesOrder: false,
    });

    expect(refund).toBe(0);
  });

  it('never goes below zero', () => {
    const base = {
      orderSubtotal: 10,
      orderTotal: 10,
      orderDeliveryFee: 0,
      itemsValue: 5,
      reserved: 12,
    };

    expect(calculateReturnRefund({ ...base, completesOrder: true })).toBe(0);
    expect(calculateReturnRefund({ ...base, completesOrder: false })).toBe(0);
  });
});

describe('checkEligibility', () => {
  const DELIVERED = new Date('2026-11-01T10:00:00.000Z');
  const END = new Date('2026-11-15T10:00:00.000Z'); // 14 days later

  it('lets a delivered order be returned, and says when the days end', () => {
    const result = checkEligibility(
      { status: 'Delivered', deliveredAt: DELIVERED },
      new Date('2026-11-08T10:00:00.000Z'),
    );

    expect(result).toEqual({ eligible: true, windowEndsAt: END });
  });

  it('still lets it be returned at the very last moment', () => {
    const result = checkEligibility(
      { status: 'Delivered', deliveredAt: DELIVERED },
      END,
    );

    expect(result).toMatchObject({ eligible: true });
  });

  it('refuses it one millisecond after the last moment', () => {
    const result = checkEligibility(
      { status: 'Delivered', deliveredAt: DELIVERED },
      new Date(END.getTime() + 1),
    );

    expect(result).toEqual({
      eligible: false,
      code: 'WINDOW_CLOSED',
      message: 'The 14 days to return this order have passed',
      windowEndsAt: END,
    });
  });

  it.each(['Placed', 'Packed', 'Out for Delivery', 'Cancelled'])(
    'refuses an order that is %s',
    (status) => {
      const result = checkEligibility({ status, deliveredAt: null }, DELIVERED);

      expect(result).toMatchObject({
        eligible: false,
        code: 'NOT_DELIVERED',
        message: 'Only a delivered order can be returned',
      });
    },
  );

  it('refuses a delivered order that has no delivery date', () => {
    const result = checkEligibility(
      { status: 'Delivered', deliveredAt: null },
      DELIVERED,
    );

    expect(result).toMatchObject({ eligible: false, code: 'NO_DELIVERY_DATE' });
  });
});

describe('canMove', () => {
  it.each<[ReturnStatus, ReturnStatus]>([
    ['REQUESTED', 'APPROVED'],
    ['REQUESTED', 'REJECTED'],
    ['REQUESTED', 'CANCELLED'],
    ['APPROVED', 'COMPLETED'],
    ['APPROVED', 'REJECTED'],
  ])('allows %s to become %s', (from, to) => {
    expect(canMove(from, to)).toBe(true);
  });

  it.each<[ReturnStatus, ReturnStatus]>([
    ['APPROVED', 'CANCELLED'],
    ['REQUESTED', 'COMPLETED'],
    ['COMPLETED', 'REJECTED'],
    ['COMPLETED', 'APPROVED'],
    ['REJECTED', 'APPROVED'],
    ['CANCELLED', 'REQUESTED'],
  ])('does not allow %s to become %s', (from, to) => {
    expect(canMove(from, to)).toBe(false);
  });
});

describe('refundStatusOf', () => {
  it.each([
    ['succeeded', 'refunded'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
    ['pending', 'pending'],
    ['requires_action', 'pending'],
    [null, 'pending'],
    [undefined, 'pending'],
  ])('turns the Stripe status %j into %j', (status, expected) => {
    expect(refundStatusOf(status)).toBe(expected);
  });
});

describe('cleanReturnSearch', () => {
  it.each([
    ['#R-AB12cd34', 'AB12cd34'],
    ['r-ab12', 'ab12'],
    ['  #ab12 ', 'ab12'],
    ['ab12', 'ab12'],
    [undefined, ''],
  ])('turns %j into %j', (value, expected) => {
    expect(cleanReturnSearch(value)).toBe(expected);
  });
});
