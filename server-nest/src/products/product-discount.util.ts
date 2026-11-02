// The discount percentage of a product, from its price and its price before the discount.
// ONE place for the formula: the product list, the product page and the favorites all use it.
// It is never negative (a price above the "original" price is not a discount)
export function withDiscount<
  T extends { price: number; originalPrice: number | null },
>(product: T) {
  const discount =
    product.originalPrice && product.price
      ? Math.max(
          0,
          Math.round(
            ((product.originalPrice - product.price) / product.originalPrice) *
              100,
          ),
        )
      : 0;
  return { ...product, discount };
}
