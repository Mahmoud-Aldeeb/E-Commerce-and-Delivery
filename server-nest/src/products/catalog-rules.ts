// The rules of the catalog filters (sizes, colours) and of the optional texts of a product.
// Pure functions: no database, no Nest

// The order a customer expects: XS, then S, then M. 2XL is the same size as XXL.
// A Map and not an object: "constructor" must never count as a size that has a rank
const LETTER_RANK = new Map<string, number>([
  ['xxs', 0],
  ['xs', 1],
  ['s', 2],
  ['m', 3],
  ['l', 4],
  ['xl', 5],
  ['xxl', 6],
  ['2xl', 6],
  ['xxxl', 7],
  ['3xl', 7],
  ['4xl', 8],
]);
const NUMBER = /^\d+(\.\d+)?$/;

// group 0 = letter sizes, 1 = number sizes (shoes, trousers), 2 = any other text
function sizeKey(size: string) {
  const text = size.trim().toLowerCase();
  const letter = LETTER_RANK.get(text);
  if (letter !== undefined) return { group: 0, rank: letter, text };
  if (NUMBER.test(text)) return { group: 1, rank: Number(text), text };
  return { group: 2, rank: 0, text };
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export const compareSizes = (a: string, b: string): number => {
  const first = sizeKey(a);
  const second = sizeKey(b);
  return (
    first.group - second.group ||
    first.rank - second.rank ||
    byText(first.text, second.text)
  );
};

export const sortSizes = (sizes: string[]): string[] =>
  [...sizes].sort(compareSizes);

export interface FilterColor {
  name: string;
  hex: string | null;
}

export interface FilterOptions {
  sizes: string[];
  colors: FilterColor[];
}

interface OptionRow {
  size: string;
  color: string;
  colorHex: string | null;
}

// What the filter panel offers, from the variants that are in stock.
// "m" and "M" are one size, "black" and "Black" one colour: the spelling that sorts first is shown
export function buildFilterOptions(rows: OptionRow[]): FilterOptions {
  const sizes = new Map<string, string>();
  for (const size of rows
    .map((row) => row.size)
    .filter(Boolean)
    .sort(byText)) {
    const key = size.toLowerCase();
    if (!sizes.has(key)) sizes.set(key, size);
  }

  // Rows with a colour code come first inside the same colour name, so the code is deterministic.
  // "~" sorts after every character of a code: a row without a code goes last
  const colors = new Map<string, FilterColor>();
  const named = rows
    .filter((row) => row.color)
    .sort(
      (a, b) =>
        byText(a.color, b.color) ||
        byText(a.colorHex ?? '~', b.colorHex ?? '~'),
    );
  for (const row of named) {
    const key = row.color.toLowerCase();
    const found = colors.get(key);
    if (!found) colors.set(key, { name: row.color, hex: row.colorHex });
    else if (found.hex === null && row.colorHex !== null)
      found.hex = row.colorHex;
  }

  return {
    sizes: sortSizes([...sizes.values()]),
    colors: [...colors.values()].sort((a, b) =>
      byText(a.name.toLowerCase(), b.name.toLowerCase()),
    ),
  };
}

// Spaces around a text go, and a run of spaces becomes one. Nothing = ''
export const cleanOption = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, ' ');

// An optional text of a product: the column holds NULL, never an empty text
export const textOrNull = (value: string | null | undefined): string | null =>
  cleanOption(value) || null;
