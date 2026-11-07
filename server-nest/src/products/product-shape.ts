import type { Prisma } from '../generated/prisma/client.js';
import { withDiscount } from './product-discount.util.js';

const VARIANT_FIELDS = {
  id: true,
  size: true,
  color: true,
  colorHex: true,
  stock: true,
  image: true,
} as const;

// A list only needs to know WHETHER a product has options (its card says "Choose options")
export const LIST_INCLUDE = {
  _count: { select: { variants: true } },
} as const satisfies Prisma.ProductInclude;

// One product comes with its variants, in the order the admin gave
export const DETAIL_INCLUDE = {
  variants: {
    select: VARIANT_FIELDS,
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude;

// What the API gives for a product: the discount, and how many variants it has (never the raw count)
export function toPublicProduct<
  T extends { price: number; originalPrice: number | null },
>(product: T & { _count?: { variants: number }; variants?: unknown[] }) {
  const { _count, ...rest } = product;
  return {
    ...withDiscount(rest),
    variantCount: _count?.variants ?? rest.variants?.length ?? 0,
  };
}
