import type { CartItem, Product, ProductVariant } from "@/types";

// A cart line is told apart by its product AND its option: the same shirt in M and in L are two lines.
// A product without options keeps the plain product id, so a cart saved before options existed still works
export const lineKey = (
  productId: string,
  variantId?: string | null,
): string => (variantId ? `${productId}:${variantId}` : productId);

export const keyOf = (item: Pick<CartItem, "product" | "variant">): string =>
  lineKey(item.product.id, item.variant?.id);

// "M / Black", "M", "Black", or "" when there is neither
export const variantLabel = (
  variant: Pick<ProductVariant, "size" | "color">,
): string => [variant.size, variant.color].filter(Boolean).join(" / ");

// The stock that limits a line: the one of its option, or of the product when it has no options.
// null = no known limit
export const stockOf = (
  product: Product,
  variant?: ProductVariant | null,
): number | null => (variant ? variant.stock : product.stock);

export const maxQuantity = (
  product: Product,
  variant?: ProductVariant | null,
): number => stockOf(product, variant) ?? Number.POSITIVE_INFINITY;

// The picture of a line: the one of its option, else the one of the product
export const lineImage = (
  item: Pick<CartItem, "product" | "variant">,
): string => item.variant?.image || item.product.image;
