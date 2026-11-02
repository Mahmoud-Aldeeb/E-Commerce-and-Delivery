import { describe, expect, it } from 'vitest';
import { authorLabel, boughtProduct, summarize } from './review-rules.js';

describe('authorLabel', () => {
  it('shows the first name and the first letter of the last name', () => {
    expect(authorLabel('Mahmoud Aldeeb')).toBe('Mahmoud A.');
  });

  it('takes the initial from the LAST word', () => {
    expect(authorLabel('Ali Mohamed Hassan')).toBe('Ali H.');
  });

  it('capitalizes the initial', () => {
    expect(authorLabel('sara ibrahim')).toBe('sara I.');
  });

  it('shows a single name as it is', () => {
    expect(authorLabel('Ali')).toBe('Ali');
  });

  it('ignores extra spaces', () => {
    expect(authorLabel('  Ali   Hassan  ')).toBe('Ali H.');
  });

  it('works with another alphabet', () => {
    // The first letter of "الديب" is "ا"
    expect(authorLabel('محمود الديب')).toBe('محمود ا.');
  });

  it.each([[''], ['   ']])(
    'falls back to "Customer" for the name "%s"',
    (name) => {
      expect(authorLabel(name)).toBe('Customer');
    },
  );

  it('cuts a very long first name', () => {
    expect(authorLabel(`${'A'.repeat(50)} Hassan`)).toBe(
      `${'A'.repeat(30)} H.`,
    );
  });
});

describe('summarize', () => {
  it('is all zeros when there is no review', () => {
    expect(summarize([])).toEqual({
      average: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it('counts the reviews of each star and averages them to 2 decimals', () => {
    // 5 + 5 + 4 = 14, and 14 / 3 = 4.6666...
    expect(
      summarize([
        { rating: 5, count: 2 },
        { rating: 4, count: 1 },
      ]),
    ).toEqual({
      average: 4.67,
      count: 3,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 },
    });
  });

  it('gives the exact average when it is round', () => {
    expect(
      summarize([
        { rating: 3, count: 1 },
        { rating: 5, count: 1 },
      ]).average,
    ).toBe(4);
  });

  it('ignores a rating that is not a whole number from 1 to 5', () => {
    const result = summarize([
      { rating: 0, count: 4 },
      { rating: 6, count: 4 },
      { rating: 2.5, count: 4 },
      { rating: 5, count: 1 },
    ]);

    expect(result.count).toBe(1);
    expect(result.average).toBe(5);
  });
});

describe('boughtProduct', () => {
  const orders = [
    { items: [{ product: 'p1', quantity: 2 }] },
    {
      items: [
        { product: 'p2', quantity: 1 },
        { product: 'p3', quantity: 1 },
      ],
    },
  ];

  it('finds a product in any order', () => {
    expect(boughtProduct(orders, 'p1')).toBe(true);
    expect(boughtProduct(orders, 'p3')).toBe(true);
  });

  it('is false for a product that is in none of them', () => {
    expect(boughtProduct(orders, 'p9')).toBe(false);
  });

  it('is false when there is no order', () => {
    expect(boughtProduct([], 'p1')).toBe(false);
  });

  it('survives stored items that are not a list or have a wrong shape', () => {
    expect(
      boughtProduct(
        [{ items: null }, { items: 'oops' }, { items: { product: 'p1' } }],
        'p1',
      ),
    ).toBe(false);
    expect(boughtProduct([{ items: [null, 5, 'p1', {}] }], 'p1')).toBe(false);
  });
});
