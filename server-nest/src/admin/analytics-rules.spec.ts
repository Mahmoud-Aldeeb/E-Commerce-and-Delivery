import { describe, expect, it } from 'vitest';
import {
  buildDailySales,
  isAutoCancelled,
  paceDaysLeft,
  percentChange,
  rankCancelledProducts,
  readItems,
  refundKind,
  sortLowStock,
  summarizeDays,
  topSellers,
  totalsByProduct,
  type LowStockRow,
  type ProductTotals,
} from './analytics-rules.js';

const line = (
  product: string,
  quantity: number,
  price: number,
  name = 'X',
  image = 'x.png',
) => ({
  product,
  name,
  image,
  price,
  quantity,
});

// Four orders, newest first. Cairo is UTC+2 in December: 22:30 UTC is already 00:30 of the next day
const orders = [
  {
    createdAt: new Date('2026-12-10T08:00:00.000Z'), // Dec 10
    total: 30,
    discount: 5,
    items: [
      line('p1', 2, 10, 'Watch', 'w.png'),
      line('p2', 1, 10, 'Mat', 'm.png'),
    ],
  },
  {
    createdAt: new Date('2026-12-09T22:30:00.000Z'), // Dec 10, 00:30 in Cairo
    total: 12,
    discount: 0,
    items: [line('p1', 1, 10, 'Watch', 'w.png')],
  },
  {
    createdAt: new Date('2026-12-09T21:30:00.000Z'), // Dec 9, 23:30 in Cairo
    total: 20,
    discount: 0,
    items: [line('p2', 2, 10, 'Mat', 'm.png')],
  },
  {
    createdAt: new Date('2026-12-06T10:00:00.000Z'), // Dec 6
    total: 8,
    discount: 1,
    items: [line('p3', 1, 8, 'Lamp', 'l.png')],
  },
];

describe('readItems', () => {
  it('reads the lines of an order', () => {
    expect(readItems([line('p1', 2, 9.99, 'Watch', 'w.png')])).toEqual([
      {
        productId: 'p1',
        name: 'Watch',
        image: 'w.png',
        price: 9.99,
        quantity: 2,
      },
    ]);
  });

  it('fills a missing name and image', () => {
    expect(readItems([{ product: 'p1', price: 5, quantity: 1 }])).toEqual([
      {
        productId: 'p1',
        name: 'Unknown product',
        image: '',
        price: 5,
        quantity: 1,
      },
    ]);
  });

  it('skips the lines that do not look right, and keeps the good ones', () => {
    const lines = readItems([
      null,
      5,
      'p1',
      { price: 5, quantity: 1 }, // no product
      { product: '', price: 5, quantity: 1 },
      { product: 'p1', price: 5, quantity: 0 },
      { product: 'p1', price: 5, quantity: 1.5 },
      { product: 'p1', price: -1, quantity: 1 },
      { product: 'p1', price: 'free', quantity: 1 },
      line('ok', 1, 5),
    ]);

    expect(lines.map((item) => item.productId)).toEqual(['ok']);
  });

  it.each([[null], [undefined], ['oops'], [{ product: 'p1' }]])(
    'gives no lines for %j',
    (value) => {
      expect(readItems(value)).toEqual([]);
    },
  );
});

describe('isAutoCancelled', () => {
  const entry = (note: unknown, status = 'Cancelled') => ({
    status,
    note,
    timestamp: 't',
  });

  it('is true for the order the system cancelled after an item sold out', () => {
    expect(
      isAutoCancelled([
        entry('Order placed', 'Placed'),
        entry(
          'Cancelled automatically: an item sold out before the payment arrived',
        ),
      ]),
    ).toBe(true);
  });

  it.each([
    ['by the customer', 'Cancelled by the customer'],
    ['by the store', 'Cancelled by the store: no stock'],
    ['by the courier', 'Cancelled by the courier'],
  ])('is false for an order cancelled %s', (_label, note) => {
    expect(isAutoCancelled([entry(note)])).toBe(false);
  });

  it('is false when the note is not on a Cancelled entry', () => {
    expect(
      isAutoCancelled([entry('Cancelled automatically: x', 'Placed')]),
    ).toBe(false);
  });

  it.each([[null], ['oops'], [[null, 5, {}, entry(7)]]])(
    'is false for a history like %j',
    (value) => {
      expect(isAutoCancelled(value)).toBe(false);
    },
  );
});

describe('buildDailySales', () => {
  it('gives every day of the period, the empty ones too, oldest first, by the day of the store', () => {
    expect(buildDailySales(orders, '2026-12-04', '2026-12-10')).toEqual([
      { date: '2026-12-04', orders: 0, revenue: 0, discount: 0 },
      { date: '2026-12-05', orders: 0, revenue: 0, discount: 0 },
      { date: '2026-12-06', orders: 1, revenue: 8, discount: 1 },
      { date: '2026-12-07', orders: 0, revenue: 0, discount: 0 },
      { date: '2026-12-08', orders: 0, revenue: 0, discount: 0 },
      { date: '2026-12-09', orders: 1, revenue: 20, discount: 0 },
      { date: '2026-12-10', orders: 2, revenue: 42, discount: 5 },
    ]);
  });

  it('leaves out the orders that are outside the period', () => {
    const outside = [
      {
        createdAt: new Date('2026-12-03T10:00:00.000Z'),
        total: 99,
        discount: 0,
      },
      {
        createdAt: new Date('2026-12-11T10:00:00.000Z'),
        total: 99,
        discount: 0,
      },
    ];

    const days = buildDailySales(outside, '2026-12-04', '2026-12-10');

    expect(days).toHaveLength(7);
    expect(days.every((day) => day.orders === 0)).toBe(true);
  });

  it('works for a period of one day', () => {
    expect(buildDailySales(orders, '2026-12-10', '2026-12-10')).toEqual([
      { date: '2026-12-10', orders: 2, revenue: 42, discount: 5 },
    ]);
  });

  it('adds the cents without drift', () => {
    const tenths = Array.from({ length: 3 }, () => ({
      createdAt: new Date('2026-12-10T08:00:00.000Z'),
      total: 0.1,
      discount: 0.1,
    }));

    expect(
      buildDailySales(tenths, '2026-12-10', '2026-12-10')[0],
    ).toMatchObject({ revenue: 0.3, discount: 0.3 });
  });
});

describe('summarizeDays', () => {
  it('adds the days up and finds the best one', () => {
    expect(
      summarizeDays(buildDailySales(orders, '2026-12-04', '2026-12-10')),
    ).toEqual({
      orders: 4,
      revenue: 70,
      discount: 6,
      averageOrder: 17.5,
      bestDay: { date: '2026-12-10', revenue: 42 },
    });
  });

  it('rounds the average order to the cent', () => {
    // 10 dollars in 3 orders is 3.333...
    expect(
      summarizeDays([
        { date: '2026-12-10', orders: 3, revenue: 10, discount: 0 },
      ]).averageOrder,
    ).toBe(3.33);
  });

  it('keeps the earliest day when two days sold the same', () => {
    const result = summarizeDays([
      { date: '2026-12-08', orders: 1, revenue: 20, discount: 0 },
      { date: '2026-12-09', orders: 1, revenue: 20, discount: 0 },
    ]);

    expect(result.bestDay).toEqual({ date: '2026-12-08', revenue: 20 });
  });

  it('has no best day and no average when nothing was sold', () => {
    expect(
      summarizeDays(buildDailySales([], '2026-12-04', '2026-12-10')),
    ).toEqual({
      orders: 0,
      revenue: 0,
      discount: 0,
      averageOrder: 0,
      bestDay: null,
    });
  });
});

describe('percentChange', () => {
  it.each([
    [4, 2, 100],
    [70, 50, 40],
    [50, 100, -50],
    [1, 3, -67],
    [0, 5, -100],
    [5, 5, 0],
  ])('is %i against %i: %i%%', (current, previous, expected) => {
    expect(percentChange(current, previous)).toBe(expected);
  });

  it.each([[0], [-1]])(
    'is null when there was nothing before (%i)',
    (previous) => {
      expect(percentChange(5, previous)).toBeNull();
    },
  );
});

describe('totalsByProduct and topSellers', () => {
  it('adds the units, the revenue and the orders of every product', () => {
    const totals = totalsByProduct(orders);

    expect(totals.get('p1')).toEqual({
      name: 'Watch',
      image: 'w.png',
      units: 3,
      revenueCents: 3000,
      orders: 2,
    });
    expect(totals.get('p2')).toEqual({
      name: 'Mat',
      image: 'm.png',
      units: 3,
      revenueCents: 3000,
      orders: 2,
    });
    expect(totals.get('p3')).toEqual({
      name: 'Lamp',
      image: 'l.png',
      units: 1,
      revenueCents: 800,
      orders: 1,
    });
  });

  it('takes the name of the NEWEST order (the first one it sees)', () => {
    const renamed = [
      { items: [line('p1', 1, 10, 'New name', 'new.png')] },
      { items: [line('p1', 1, 10, 'Old name', 'old.png')] },
    ];

    expect(totalsByProduct(renamed).get('p1')).toMatchObject({
      name: 'New name',
      image: 'new.png',
    });
  });

  it('counts a product that is on two lines of one order as ONE order', () => {
    const totals = totalsByProduct([
      { items: [line('p1', 1, 10), line('p1', 2, 10)] },
    ]);

    expect(totals.get('p1')).toMatchObject({ units: 3, orders: 1 });
  });

  it('ranks by units, then revenue, then id, and cuts at the limit', () => {
    const ranked = topSellers(totalsByProduct(orders), 10);

    // p1 and p2 sold 3 units for 30 dollars each: the id breaks the tie
    expect(ranked.map((seller) => seller.productId)).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    expect(ranked[0]).toEqual({
      productId: 'p1',
      name: 'Watch',
      image: 'w.png',
      units: 3,
      revenue: 30,
      orders: 2,
    });
    expect(
      topSellers(totalsByProduct(orders), 2).map((seller) => seller.productId),
    ).toEqual(['p1', 'p2']);
  });

  it('puts the product with more revenue first when the units are equal', () => {
    const totals = totalsByProduct([
      { items: [line('cheap', 2, 1), line('dear', 2, 50)] },
    ]);

    expect(topSellers(totals, 2).map((seller) => seller.productId)).toEqual([
      'dear',
      'cheap',
    ]);
  });
});

describe('rankCancelledProducts', () => {
  const totals = (units: number, ordersCount: number): ProductTotals => ({
    name: 'X',
    image: '',
    units,
    revenueCents: 0,
    orders: ordersCount,
  });

  const cancelled = new Map([
    ['a', totals(3, 3)],
    ['b', totals(3, 3)],
    ['c', totals(2, 2)],
    ['d', totals(1, 1)], // in one cancelled order only: not listed
    ['e', totals(6, 3)],
    ['f', totals(2, 2)], // never sold otherwise
  ]);
  const sold = new Map([
    ['a', totals(1, 1)],
    ['b', totals(27, 20)],
    ['c', totals(2, 2)],
    ['e', totals(12, 8)],
  ]);

  it('lists the products of 2 or more cancelled orders, with the share of units that was cancelled', () => {
    const ranked = rankCancelledProducts(cancelled, sold, 10);

    expect(
      ranked.map((product) => [
        product.productId,
        product.cancelledOrders,
        product.cancelRate,
      ]),
    ).toEqual([
      ['a', 3, 75], // 3 of 4 units
      ['e', 3, 33], // 6 of 18 units
      ['b', 3, 10], // 3 of 30 units
      ['f', 2, 100], // 2 of 2 units
      ['c', 2, 50], // 2 of 4 units
    ]);
    expect(ranked[0]).toMatchObject({ cancelledUnits: 3, orderedUnits: 4 });
  });

  it('flags a product only when it is in 3 cancelled orders AND a quarter of its units was cancelled', () => {
    const flagged = Object.fromEntries(
      rankCancelledProducts(cancelled, sold, 10).map((product) => [
        product.productId,
        product.flagged,
      ]),
    );

    expect(flagged).toEqual({
      a: true,
      e: true,
      b: false, // 3 orders, but only 10% of its units
      f: false, // 100%, but only 2 orders
      c: false,
    });
  });

  it('cuts at the limit', () => {
    expect(
      rankCancelledProducts(cancelled, sold, 2).map(
        (product) => product.productId,
      ),
    ).toEqual(['a', 'e']);
  });

  it('is empty when no product is in 2 cancelled orders', () => {
    expect(
      rankCancelledProducts(new Map([['d', totals(1, 1)]]), sold, 10),
    ).toEqual([]);
    expect(rankCancelledProducts(new Map(), new Map(), 10)).toEqual([]);
  });
});

describe('paceDaysLeft', () => {
  it.each([
    [4, 3, 7, 9], // 3 units in 7 days: 4 units last 9.3 days
    [3, 30, 30, 3], // 1 unit a day
    [1, 700, 7, 1], // never less than a day while there is stock
  ])(
    'gives %i days for stock %i sold %i in %i days',
    (stock, sold, period, expected) => {
      expect(paceDaysLeft(stock, sold, period)).toBe(expected);
    },
  );

  it('is 0 when there is no stock, even if nothing was sold', () => {
    expect(paceDaysLeft(0, 50, 7)).toBe(0);
    expect(paceDaysLeft(0, 0, 7)).toBe(0);
    expect(paceDaysLeft(-1, 0, 7)).toBe(0);
  });

  it('is null when there is stock but nothing was sold (there is no pace)', () => {
    expect(paceDaysLeft(5, 0, 7)).toBeNull();
  });
});

describe('sortLowStock', () => {
  const row = (
    id: string,
    stock: number,
    soldInPeriod: number,
    daysLeft: number | null,
  ): LowStockRow => ({
    id,
    name: id,
    image: '',
    stock,
    soldInPeriod,
    daysLeft,
  });

  it('puts the products that sell and run out soonest first, and the ones nobody buys last', () => {
    const sorted = sortLowStock([
      row('c', 0, 0, 0), // out, but nobody buys it
      row('b', 8, 3, 19),
      row('d', 2, 0, null),
      row('a', 5, 10, 2),
      row('e', 0, 5, 0), // out AND in demand: the most urgent
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('does not change the list it was given', () => {
    const rows = [row('b', 5, 1, 5), row('a', 1, 1, 1)];

    sortLowStock(rows);

    expect(rows.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('refundKind', () => {
  it('tells a refund that was never recorded, one that failed, and one that is still pending', () => {
    expect(refundKind(null)).toBe('missing');
    expect(refundKind('failed')).toBe('failed');
    expect(refundKind('pending')).toBe('pending');
  });
});
