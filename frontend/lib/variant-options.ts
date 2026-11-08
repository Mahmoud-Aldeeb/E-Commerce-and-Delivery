import type { ProductVariant } from "@/types";

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

// In the order the store gave them
export const sizesOf = (variants: ProductVariant[]) =>
  unique(variants.map((variant) => variant.size));
export const colorsOf = (variants: ProductVariant[]) =>
  unique(variants.map((variant) => variant.color));

// A product without sizes stores "" as the size, so "" is a real value here
export const findVariant = (
  variants: ProductVariant[],
  size: string,
  color: string,
): ProductVariant | null =>
  variants.find(
    (variant) => variant.size === size && variant.color === color,
  ) ?? null;

// Is there stock for this size (or colour), given what is already chosen in the OTHER field?
// `other` = "" when nothing is chosen there yet
export function hasStockWith(
  variants: ProductVariant[],
  field: "size" | "color",
  value: string,
  other: string,
): boolean {
  const otherField = field === "size" ? "color" : "size";
  return variants.some(
    (variant) =>
      variant[field] === value &&
      (other === "" || variant[otherField] === other) &&
      variant.stock > 0,
  );
}
