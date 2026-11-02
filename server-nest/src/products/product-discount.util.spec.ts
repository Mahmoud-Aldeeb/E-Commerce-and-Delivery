import { describe, expect, it } from 'vitest';
import { withDiscount } from './product-discount.util.js';

describe('withDiscount', () => {
  it('calculates the percentage and rounds it', () => {
    // 129.99 -> 89.99 saves 40.00, which is 30.77% of 129.99
    expect(withDiscount({ price: 89.99, originalPrice: 129.99 }).discount).toBe(
      31,
    );
    // 24.99 -> 18.99 saves 6.00, which is 24.01%
    expect(withDiscount({ price: 18.99, originalPrice: 24.99 }).discount).toBe(
      24,
    );
  });

  it('keeps every other field of the product', () => {
    expect(
      withDiscount({ id: 'p1', name: 'Watch', price: 10, originalPrice: 20 }),
    ).toEqual({
      id: 'p1',
      name: 'Watch',
      price: 10,
      originalPrice: 20,
      discount: 50,
    });
  });

  it.each([
    ['no original price', null],
    ['an original price of 0', 0],
  ])('is 0 with %s', (_label, originalPrice) => {
    expect(withDiscount({ price: 10, originalPrice }).discount).toBe(0);
  });

  it('is 0 when the original price equals the price', () => {
    expect(withDiscount({ price: 10, originalPrice: 10 }).discount).toBe(0);
  });

  it('is never negative when the "original" price is lower than the price', () => {
    expect(withDiscount({ price: 20, originalPrice: 10 }).discount).toBe(0);
  });
});
