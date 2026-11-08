import type { ProductVariant } from "@/types";

export const MAX_VARIANTS = 100; // the same limit as the API
export const MAX_GALLERY_IMAGES = 9; // the main image + up to 8 more (the API keeps 8 extra at most)
const MAX_STOCK = 100_000; // the same limit as the API

export type VariantField = "size" | "color" | "stock";
export type RowErrors = Partial<Record<VariantField, string>>;

// One row of the editor. Every field is TEXT, because that is what an input holds
export interface VariantRow {
  key: string; // only for React: tells the rows apart on the screen
  id?: string; // present = an option that already exists (it keeps its identity when saved)
  size: string;
  color: string;
  stock: string;
  image: string; // "" = no image of its own
}

// What the API receives for one option. No colour code: colours are shown by name only
export interface VariantPayload {
  id?: string;
  size: string;
  color: string;
  stock: number;
  image: string | null;
}

export interface VariantCheck {
  ok: boolean;
  rows: Record<string, RowErrors>; // by the key of the row
  general?: string;
}

let counter = 0;
const nextKey = () => `row-${++counter}`;

export const emptyRow = (): VariantRow => ({
  key: nextKey(),
  size: "",
  color: "",
  stock: "",
  image: "",
});

export const rowsFromVariants = (
  variants: ProductVariant[] = [],
): VariantRow[] =>
  variants.map((variant) => ({
    key: nextKey(),
    id: variant.id,
    size: variant.size,
    color: variant.color,
    stock: String(variant.stock),
    image: variant.image ?? "",
  }));

// The same cleaning as the API: spaces around a text go, and a run of spaces becomes one
const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function checkVariantRows(rows: VariantRow[]): VariantCheck {
  const errors: Record<string, RowErrors> = {};
  const fail = (key: string, field: VariantField, message: string) => {
    errors[key] = { ...errors[key], [field]: message };
  };
  let general: string | undefined;

  if (rows.length > MAX_VARIANTS) {
    general = `A product can have at most ${MAX_VARIANTS} options.`;
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const size = clean(row.size);
    const color = clean(row.color);

    if (!size && !color) fail(row.key, "size", "Enter a size or a colour.");
    if (size.length > 20) fail(row.key, "size", "20 characters or fewer.");
    if (color.length > 30) fail(row.key, "color", "30 characters or fewer.");

    const stock = row.stock.trim() === "" ? Number.NaN : Number(row.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
      fail(row.key, "stock", `A whole number from 0 to ${MAX_STOCK}.`);
    }

    // "m" and "M" are the same size, and "black" and "Black" the same colour
    if (size || color) {
      const pair = `${size.toLowerCase()}|${color.toLowerCase()}`;
      if (seen.has(pair)) fail(row.key, "size", "This option appears twice.");
      seen.add(pair);
    }
  }

  // One shape for the whole product: a shop page cannot ask for a size of some options only
  const withSize = rows.filter((row) => clean(row.size)).length;
  const withColor = rows.filter((row) => clean(row.color)).length;
  if (!general && withSize !== 0 && withSize !== rows.length) {
    general = "Either every option has a size, or none of them does.";
  } else if (!general && withColor !== 0 && withColor !== rows.length) {
    general = "Either every option has a colour, or none of them does.";
  }

  return {
    ok: !general && Object.keys(errors).length === 0,
    rows: errors,
    general,
  };
}

// The rows, in the shape the API takes. Call it only after checkVariantRows said ok.
// `images` = the images of the product: an option can only show one of them
export function toPayload(
  rows: VariantRow[],
  images: string[],
): VariantPayload[] {
  return rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}),
    size: clean(row.size),
    color: clean(row.color),
    stock: Number(row.stock),
    image: row.image && images.includes(row.image) ? row.image : null,
  }));
}

// What the product will hold: the total of its options (a row that is not a number yet counts as 0)
export const totalStock = (rows: VariantRow[]): number =>
  rows.reduce((sum, row) => {
    const stock = Number(row.stock);
    return sum + (Number.isInteger(stock) && stock > 0 ? stock : 0);
  }, 0);
