import { describe, expect, it } from 'vitest';
import {
  cleanImages,
  normalizeVariants,
  sumStock,
  variantLabel,
  type VariantInput,
} from './variant-rules.js';

// A variant that is valid by default: the tests change only what they are about
const variant = (overrides: Partial<VariantInput> = {}): VariantInput => ({
  size: 'M',
  stock: 1,
  ...overrides,
});

describe('variantLabel', () => {
  it('joins the size and the colour', () => {
    expect(variantLabel({ size: 'M', color: 'Black' })).toBe('M / Black');
  });

  it('gives only the size, or only the colour, when the other is missing', () => {
    expect(variantLabel({ size: 'M', color: '' })).toBe('M');
    expect(variantLabel({ size: null, color: 'Black' })).toBe('Black');
  });

  it('gives an empty text when there is neither', () => {
    expect(variantLabel({})).toBe('');
    expect(variantLabel({ size: '', color: null })).toBe('');
  });
});

describe('sumStock', () => {
  it('adds the stock of the variants', () => {
    expect(sumStock([{ stock: 3 }, { stock: 4 }, { stock: 0 }])).toBe(7);
  });

  it('is 0 for no variants', () => {
    expect(sumStock([])).toBe(0);
  });
});

describe('cleanImages', () => {
  it('trims, drops repeats, drops blanks and drops the main image', () => {
    expect(
      cleanImages(
        ['a.jpg', ' a.jpg ', '', '   ', 'main.jpg', 'b.jpg'],
        'main.jpg',
      ),
    ).toEqual(['a.jpg', 'b.jpg']);
  });

  it('keeps only the first 8', () => {
    const many = Array.from({ length: 12 }, (_, index) => `i${index + 1}.jpg`);

    expect(cleanImages(many, 'main.jpg')).toEqual([
      'i1.jpg',
      'i2.jpg',
      'i3.jpg',
      'i4.jpg',
      'i5.jpg',
      'i6.jpg',
      'i7.jpg',
      'i8.jpg',
    ]);
  });

  it('answers an empty list when nothing was sent', () => {
    expect(cleanImages(undefined, 'main.jpg')).toEqual([]);
    expect(cleanImages(null, 'main.jpg')).toEqual([]);
  });
});

describe('normalizeVariants', () => {
  const images = ['main.jpg', 'a.jpg'];

  it('gives the variants in the shape that is saved', () => {
    const result = normalizeVariants(
      [
        variant({
          id: 'v1',
          size: '  M ',
          color: 'Light   Blue',
          colorHex: '#ABCDEF',
          stock: 3,
          image: ' a.jpg ',
        }),
        variant({ id: '', size: 'L', color: 'Light Blue', stock: 0 }),
      ],
      images,
    );

    expect(result).toEqual({
      ok: true,
      variants: [
        {
          id: 'v1', // an existing variant keeps its id
          size: 'M',
          color: 'Light Blue',
          colorHex: '#abcdef',
          stock: 3,
          image: 'a.jpg',
          sortOrder: 0,
        },
        {
          id: undefined, // an empty id means a new variant
          size: 'L',
          color: 'Light Blue',
          colorHex: null,
          stock: 0,
          image: null,
          sortOrder: 1,
        },
      ],
    });
  });

  it('accepts no variants at all', () => {
    expect(normalizeVariants([], images)).toEqual({ ok: true, variants: [] });
  });

  it('accepts a product with colours only', () => {
    const result = normalizeVariants(
      [
        variant({ size: '', color: 'Black', stock: 2 }),
        variant({ size: '', color: 'Red', stock: 3 }),
      ],
      images,
    );

    expect(result).toMatchObject({ ok: true });
  });

  it('refuses a variant with neither a size nor a colour', () => {
    const message = 'Every variant needs a size or a colour';

    expect(normalizeVariants([{ stock: 1 }], images)).toEqual({
      ok: false,
      message,
    });
    expect(
      normalizeVariants([{ size: '  ', color: '', stock: 1 }], images),
    ).toEqual({ ok: false, message });
  });

  it.each([
    [
      'the same pair',
      variant({ size: 'M', color: 'Black' }),
      variant({ size: 'M', color: 'Black' }),
    ],
    [
      'a different case',
      variant({ size: 'M', color: 'Black' }),
      variant({ size: 'm', color: 'black' }),
    ],
    [
      'different spaces',
      variant({ size: 'M', color: 'Light Blue' }),
      variant({ size: ' M ', color: 'light   blue' }),
    ],
  ])('refuses two variants that are the same (%s)', (_name, first, second) => {
    expect(normalizeVariants([first, second], images)).toEqual({
      ok: false,
      message: expect.stringContaining('appears twice'),
    });
  });

  it('accepts the same size in two colours', () => {
    const result = normalizeVariants(
      [
        variant({ size: 'M', color: 'Black' }),
        variant({ size: 'M', color: 'Red' }),
      ],
      images,
    );

    expect(result).toMatchObject({ ok: true });
  });

  it('refuses a colour code that is not like #111827', () => {
    expect(
      normalizeVariants(
        [variant({ color: 'Black', colorHex: 'blue' })],
        images,
      ),
    ).toEqual({
      ok: false,
      message: '"blue" is not a colour code like #111827',
    });
  });

  it('refuses a colour code without a colour name', () => {
    expect(
      normalizeVariants([variant({ colorHex: '#111827' })], images),
    ).toEqual({ ok: false, message: 'A colour code needs a colour name' });
  });

  it('refuses an image that is not one of the images of the product', () => {
    expect(
      normalizeVariants([variant({ image: 'other.jpg' })], images),
    ).toEqual({
      ok: false,
      message:
        'The image of a variant must be one of the images of the product',
    });
  });

  it.each([-1, 1.5, Number.NaN])('refuses a stock of %s', (stock) => {
    expect(normalizeVariants([variant({ stock })], images)).toEqual({
      ok: false,
      message: 'The stock of a variant must be a whole number from 0',
    });
  });

  it('refuses a product where only some variants have a size', () => {
    expect(
      normalizeVariants(
        [
          variant({ size: 'M', color: 'Black' }),
          variant({ size: '', color: 'Red' }),
        ],
        images,
      ),
    ).toEqual({
      ok: false,
      message: 'Either every variant has a size, or none of them does',
    });
  });

  it('refuses a product where only some variants have a colour', () => {
    expect(
      normalizeVariants(
        [variant({ size: 'M', color: 'Black' }), variant({ size: 'L' })],
        images,
      ),
    ).toEqual({
      ok: false,
      message: 'Either every variant has a colour, or none of them does',
    });
  });

  it('allows 100 variants and refuses 101', () => {
    const make = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        variant({ size: `S${index}` }),
      );

    expect(normalizeVariants(make(100), images)).toMatchObject({ ok: true });
    expect(normalizeVariants(make(101), images)).toEqual({
      ok: false,
      message: 'A product can have at most 100 variants',
    });
  });
});
