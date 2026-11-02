import type { OrderItem, Product } from "@/types";

export interface ReorderPlan {
  /** What goes into the cart, with the quantity already limited by the stock */
  add: { product: Product; quantity: number }[];
  /** Items added with LESS than before, because less is in stock now */
  reduced: string[];
  /** Items that cannot be added: out of stock, or the product no longer exists */
  unavailable: string[];
}

// `products[i]` is the CURRENT product of `items[i]`, or null when it could not be found.
// The order only remembers the price and the stock of the day it was placed
export function planReorder(
  items: Pick<OrderItem, "name" | "quantity">[],
  products: (Product | null)[],
): ReorderPlan {
  const plan: ReorderPlan = { add: [], reduced: [], unavailable: [] };

  items.forEach((item, index) => {
    const product = products[index];

    if (!product || (product.stock !== null && product.stock <= 0)) {
      plan.unavailable.push(item.name);
      return;
    }

    // A product without a stock number has no known limit
    const quantity =
      product.stock === null
        ? item.quantity
        : Math.min(item.quantity, product.stock);
    if (quantity < item.quantity) plan.reduced.push(item.name);
    plan.add.push({ product, quantity });
  });

  return plan;
}

// "A, B, C and 2 more": a message must stay short
export function listNames(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}
