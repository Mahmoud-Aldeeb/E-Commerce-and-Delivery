import { describe, expect, it } from 'vitest';
import {
  buildFilterOptions,
  cleanOption,
  sortSizes,
  textOrNull,
} from './catalog-rules.js';

describe('sortSizes', () => {
  it('puts the letter sizes in the order a customer expects', () => {
    expect(sortSizes(['XL', 'S', 'M', 'XXS', 'L', 'XS', 'XXL'])).toEqual([
      'XXS',
      'XS',
      'S',
      'M',
      'L',
      'XL',
      'XXL',
    ]);
  });

  it('treats 2XL like XXL and 3XL like XXXL', () => {
    expect(sortSizes(['3XL', '2XL', 'XL'])).toEqual(['XL', '2XL', '3XL']);
  });

  it('sorts number sizes as numbers, not as text', () => {
    expect(sortSizes(['10', '8', '12', '9.5'])).toEqual([
      '8',
      '9.5',
      '10',
      '12',
    ]);
  });

  it('puts the letters first, then the numbers, then any other text', () => {
    expect(sortSizes(['One size', '42', 'M', 'Kids', 'S'])).toEqual([
      'S',
      'M',
      '42',
      'Kids',
      'One size',
    ]);
  });

  it('ignores the case when it sorts, and keeps the spelling it was given', () => {
    expect(sortSizes(['xl', 'S'])).toEqual(['S', 'xl']);
  });

  it('does not change the list it receives', () => {
    const sizes = ['L', 'S'];

    sortSizes(sizes);

    expect(sizes).toEqual(['L', 'S']);
  });

  it('does not break on a size that is named like a property of an object', () => {
    expect(sortSizes(['constructor', 'M'])).toEqual(['M', 'constructor']);
  });
});

describe('buildFilterOptions', () => {
  const row = (size: string, color = '', colorHex: string | null = null) => ({
    size,
    color,
    colorHex,
  });

  it('is empty when there are no variants', () => {
    expect(buildFilterOptions([])).toEqual({ sizes: [], colors: [] });
  });

  it('leaves out a variant that has no size, or no colour', () => {
    const result = buildFilterOptions([
      row('', 'Red', '#ff0000'),
      row('M', ''),
    ]);

    expect(result).toEqual({
      sizes: ['M'],
      colors: [{ name: 'Red', hex: '#ff0000' }],
    });
  });

  it('lists a size once when it is spelled in two ways', () => {
    const result = buildFilterOptions([row('m'), row('M'), row('L')]);

    expect(result.sizes).toEqual(['M', 'L']);
  });

  it('lists a colour once when it is spelled in two ways, with the code of the first spelling', () => {
    const result = buildFilterOptions([
      row('', 'black', '#222222'),
      row('', 'Black', '#111827'),
    ]);

    expect(result.colors).toEqual([{ name: 'Black', hex: '#111827' }]);
  });

  it('gives a colour with no code a null code', () => {
    expect(buildFilterOptions([row('', 'White')]).colors).toEqual([
      { name: 'White', hex: null },
    ]);
  });

  it('sorts the sizes like a customer expects and the colours by name', () => {
    const result = buildFilterOptions([
      row('XL', 'Red'),
      row('S', 'Blue'),
      row('10', 'Black'),
      row('Kids', 'Black'),
    ]);

    expect(result.sizes).toEqual(['S', 'XL', '10', 'Kids']);
    expect(result.colors.map((color) => color.name)).toEqual([
      'Black',
      'Blue',
      'Red',
    ]);
  });
});

describe('cleanOption', () => {
  it('removes the spaces around a text and joins a run of spaces', () => {
    expect(cleanOption('  Light   Blue ')).toBe('Light Blue');
  });

  it('gives an empty text for nothing', () => {
    expect(cleanOption(undefined)).toBe('');
    expect(cleanOption(null)).toBe('');
  });
});

describe('textOrNull', () => {
  it.each([
    ['  Nike ', 'Nike'],
    ['100%   cotton', '100% cotton'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
  ])('turns %j into %j', (value, expected) => {
    expect(textOrNull(value)).toBe(expected);
  });
});
