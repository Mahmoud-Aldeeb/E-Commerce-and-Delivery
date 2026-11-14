import { describe, expect, it } from 'vitest';
import {
  rankReturnedProducts,
  returnRate,
  sumUnits,
  unitsByProduct,
} from './return-insights.js';

const line = (
  product: string,
  quantity: number,
  name = product.toUpperCase(),
) => ({
  product,
  name,
  quantity,
  price: 10,
});

// product id -> { name, units }
const units = (entries: [string, string, number][]) =>
  new Map(entries.map(([id, name, count]) => [id, { name, units: count }]));

describe('sumUnits', () => {
  it('adds the quantities of the lines', () => {
    expect(sumUnits([line('a', 2), line('b', 3)])).toBe(5);
  });

  it('skips whatever is not a line', () => {
    const garbage = [
      line('a', 2),
      null,
      'text',
      { product: 'b' }, // no quantity
      { quantity: 2 }, // no product
      { product: 'c', quantity: 0 },
      { product: 'd', quantity: -1 },
      { product: 'e', quantity: Number.NaN },
    ];

    expect(sumUnits(garbage)).toBe(2);
  });

  it('is 0 when the items are not a list', () => {
    expect(sumUnits(null)).toBe(0);
    expect(sumUnits('nope')).toBe(0);
    expect(sumUnits({ product: 'a', quantity: 1 })).toBe(0);
  });
});

describe('unitsByProduct', () => {
  it('adds the same product over many rows, and keeps the first name it saw', () => {
    const rows = [
      { items: [line('a', 2, 'Shirt')] },
      { items: [line('a', 1, 'Shirt (new name)'), line('b', 4, 'Hat')] },
    ];

    expect(unitsByProduct(rows)).toEqual(
      units([
        ['a', 'Shirt', 3],
        ['b', 'Hat', 4],
      ]),
    );
  });

  it('skips rows whose items are not a list', () => {
    expect(unitsByProduct([{ items: 'nope' }, { items: null }]).size).toBe(0);
  });
});

describe('returnRate', () => {
  it.each([
    [0, 0, 0], // nothing at all
    [2, 0, 0], // nothing was delivered: no division by zero
    [0, 5, 0],
    [1, 3, 33],
    [2, 3, 67],
    [3, 3, 100],
    [5, 3, 100], // returns of orders delivered before the period: never over 100
  ])(
    '%j returned out of %j delivered is %j percent',
    (returned, delivered, expected) => {
      expect(returnRate(returned, delivered)).toBe(expected);
    },
  );
});

describe('rankReturnedProducts', () => {
  it('ranks by units first, then by rate, and gives the sold units and the rate', () => {
    const returned = units([
      ['a', 'A', 5],
      ['b', 'B', 5],
      ['c', 'C', 2],
    ]);
    const sold = units([
      ['a', 'A', 50], // 10%
      ['b', 'B', 10], // 50%
      ['c', 'C', 2], // 100% but only 2 units
    ]);

    expect(rankReturnedProducts(returned, sold, 10)).toEqual([
      { productId: 'b', name: 'B', returned: 5, sold: 10, rate: 50 },
      { productId: 'a', name: 'A', returned: 5, sold: 50, rate: 10 },
      { productId: 'c', name: 'C', returned: 2, sold: 2, rate: 100 },
    ]);
  });

  it('has no rate for a product with no sale in the period', () => {
    const result = rankReturnedProducts(units([['a', 'A', 2]]), new Map(), 10);

    expect(result).toEqual([
      { productId: 'a', name: 'A', returned: 2, sold: 0, rate: null },
    ]);
  });

  it('keeps only the first products of the limit', () => {
    const returned = units([
      ['a', 'A', 3],
      ['b', 'B', 2],
      ['c', 'C', 1],
    ]);

    expect(
      rankReturnedProducts(returned, new Map(), 2).map(
        (item) => item.productId,
      ),
    ).toEqual(['a', 'b']);
  });

  it('lists only products that were returned, not every product that was sold', () => {
    const result = rankReturnedProducts(
      units([['a', 'A', 1]]),
      units([
        ['a', 'A', 5],
        ['b', 'B', 9],
      ]),
      10,
    );

    expect(result.map((item) => item.productId)).toEqual(['a']);
  });

  it('breaks a tie by the name, so the order never changes between two reads', () => {
    const returned = units([
      ['z', 'Zed', 2],
      ['a', 'Alpha', 2],
    ]);
    const sold = units([
      ['z', 'Zed', 4],
      ['a', 'Alpha', 4],
    ]);

    expect(
      rankReturnedProducts(returned, sold, 10).map((item) => item.name),
    ).toEqual(['Alpha', 'Zed']);
  });
});
