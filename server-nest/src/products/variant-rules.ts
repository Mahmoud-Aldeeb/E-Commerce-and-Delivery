// The rules of the options (size, colour) of a product. Pure functions: no database, no Nest

export const MAX_VARIANTS = 100;
export const MAX_GALLERY_IMAGES = 8; // besides the main image

export interface VariantInput {
  id?: string;
  size?: string | null;
  color?: string | null;
  colorHex?: string | null;
  stock: number;
  image?: string | null;
}

export interface NormalizedVariant {
  /** Present = an existing variant of the product (it keeps its id, so carts and orders that hold it stay valid) */
  id?: string;
  size: string; // '' = the product has no sizes
  color: string; // '' = the product has no colours
  colorHex: string | null;
  stock: number;
  image: string | null;
  /** The place in the list the admin sent */
  sortOrder: number;
}

export type NormalizeResult =
  { ok: true; variants: NormalizedVariant[] } | { ok: false; message: string };

const fail = (message: string): NormalizeResult => ({ ok: false, message });

// "M / Black", "M", "Black", or "" when a variant has neither
export const variantLabel = (variant: {
  size?: string | null;
  color?: string | null;
}): string =>
  [variant.size, variant.color]
    .filter((part): part is string => Boolean(part))
    .join(' / ');

// Spaces around a text go, and a run of spaces becomes one
const clean = (value: string | null | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ');

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const sumStock = (variants: { stock: number }[]): number =>
  variants.reduce((sum, variant) => sum + variant.stock, 0);

// The extra images of a product: trimmed, without repeats, without the main image, at most 8
export function cleanImages(
  images: string[] | null | undefined,
  main: string,
): string[] {
  const unique = new Set<string>();
  for (const raw of images ?? []) {
    const image = raw.trim();
    if (image && image !== main) unique.add(image);
  }
  return [...unique].slice(0, MAX_GALLERY_IMAGES);
}

// Checks the variants an admin sent and gives them in the shape that is saved.
// `productImages` = the main image and the extra ones: a variant can only show one of them
export function normalizeVariants(
  input: VariantInput[],
  productImages: string[],
): NormalizeResult {
  if (input.length > MAX_VARIANTS) {
    return fail(`A product can have at most ${MAX_VARIANTS} variants`);
  }

  const variants: NormalizedVariant[] = [];
  const seen = new Set<string>();

  for (const [index, raw] of input.entries()) {
    const size = clean(raw.size);
    const color = clean(raw.color);
    if (!size && !color) return fail('Every variant needs a size or a colour');

    // "m" and "M" are the same size, and "black" and "Black" the same colour
    const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
    if (seen.has(key))
      return fail(
        `The variant "${variantLabel({ size, color })}" appears twice`,
      );
    seen.add(key);

    const hex = clean(raw.colorHex);
    if (hex && !color) return fail('A colour code needs a colour name');
    if (hex && !HEX_COLOR.test(hex))
      return fail(`"${hex}" is not a colour code like #111827`);

    const image = raw.image?.trim() || null;
    if (image && !productImages.includes(image)) {
      return fail(
        'The image of a variant must be one of the images of the product',
      );
    }

    if (!Number.isInteger(raw.stock) || raw.stock < 0) {
      return fail('The stock of a variant must be a whole number from 0');
    }

    variants.push({
      id: raw.id || undefined,
      size,
      color,
      colorHex: hex ? hex.toLowerCase() : null,
      stock: raw.stock,
      image,
      sortOrder: index,
    });
  }

  // One shape for the whole product: a shop page cannot ask for a size of some variants only
  const withSize = variants.filter((variant) => variant.size).length;
  if (withSize !== 0 && withSize !== variants.length) {
    return fail('Either every variant has a size, or none of them does');
  }
  const withColor = variants.filter((variant) => variant.color).length;
  if (withColor !== 0 && withColor !== variants.length) {
    return fail('Either every variant has a colour, or none of them does');
  }

  return { ok: true, variants };
}
