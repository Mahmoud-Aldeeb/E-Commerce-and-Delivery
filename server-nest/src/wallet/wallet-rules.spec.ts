import { describe, expect, it } from 'vitest';
import { splitPayment, toCents, toDollars } from './wallet-rules.js';

describe('toCents', () => {
  it.each([
    [12.78, 1278],
    [19.99, 1999],
    [0.1 + 0.2, 30], // 0.30000000000000004
    [0, 0],
    [1.1 * 3, 330], // 3.3000000000000003
  ])('turns %j dollars into %j cents', (dollars, cents) => {
    expect(toCents(dollars)).toBe(cents);
  });
});

describe('toDollars', () => {
  it.each([
    [1278, 12.78],
    [5, 0.05],
    [0, 0],
  ])('turns %j cents into %j dollars', (cents, dollars) => {
    expect(toDollars(cents)).toBe(dollars);
  });
});

describe('splitPayment', () => {
  it('pays nothing from the wallet when the customer does not use it', () => {
    expect(splitPayment(23.59, 5000, false)).toEqual({
      walletAmount: 0,
      remaining: 23.59,
      coversAll: false,
    });
  });

  it('takes the whole balance when it is smaller than the total, and leaves the rest to pay', () => {
    expect(splitPayment(23.59, 500, true)).toEqual({
      walletAmount: 5,
      remaining: 18.59,
      coversAll: false,
    });
  });

  it('covers everything when the balance is enough, and takes only the total', () => {
    expect(splitPayment(23.59, 5000, true)).toEqual({
      walletAmount: 23.59,
      remaining: 0,
      coversAll: true,
    });
  });

  it('covers an order exactly when the balance equals its total', () => {
    expect(splitPayment(12.78, 1278, true)).toEqual({
      walletAmount: 12.78,
      remaining: 0,
      coversAll: true,
    });
  });

  it('ignores an empty or a negative balance', () => {
    const empty = { walletAmount: 0, remaining: 10, coversAll: false };

    expect(splitPayment(10, 0, true)).toEqual(empty);
    expect(splitPayment(10, -300, true)).toEqual(empty);
  });

  it('counts in cents, so a sum with binary noise still covers the order exactly', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in decimal numbers
    expect(splitPayment(0.1 + 0.2, 30, true)).toEqual({
      walletAmount: 0.3,
      remaining: 0,
      coversAll: true,
    });
  });
});
