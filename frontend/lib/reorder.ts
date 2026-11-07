import { variantLabel } from "@/lib/cart-line";
import type { OrderItem, Product, ProductVariant } from "@/types";

export interface ReorderPlan {
  /** What goes into the cart, with the quantity already limited by the stock (of the option, if it has one) */
  add: { product: Product; variant: ProductVariant | null; quantity: number }[];
  /** Items added with LESS than before, because less is in stock now */
  reduced: string[];
  /** Items that cannot be added: out of stock, the option is gone, or the product no longer exists */
  unavailable: string[];
  /** The order was placed before the product had options: the customer has to choose one */
  chooseOptions: string[];
}

type ReorderItem = Pick<
  OrderItem,
  "name" | "quantity" | "variant" | "variantLabel"
>;

// "Shirt (M / Black)": the name the customer knows the line by
const nameOf = (item: ReorderItem) =>
  item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name;

// `products[i]` is the CURRENT product of `items[i]` (with its variants), or null when it could not
// be found. The order only remembers the price and the stock of the day it was placed
export function planReorder(
  items: ReorderItem[],
  products: (Product | null)[],
): ReorderPlan {
  const plan: ReorderPlan = {
    add: [],
    reduced: [],
    unavailable: [],
    chooseOptions: [],
  };

  items.forEach((item, index) => {
    const product = products[index];
    const name = nameOf(item);

    if (!product) {
      plan.unavailable.push(name);
      return;
    }

    const options = product.variants ?? [];
    let variant: ProductVariant | null = null;
    if (item.variant) {
      variant = options.find((option) => option.id === item.variant) ?? null;
      // The store removed this exact size/colour: it cannot come back
      if (!variant) {
        plan.unavailable.push(name);
        return;
      }
    } else if (options.length > 0) {
      plan.chooseOptions.push(item.name);
      return;
    }

    // The stock that limits the line is the one of the option, when it has one
    const stock = variant ? variant.stock : product.stock;
    if (stock !== null && stock <= 0) {
      plan.unavailable.push(name);
      return;
    }

    // No stock number = no known limit
    const quantity =
      stock === null ? item.quantity : Math.min(item.quantity, stock);
    if (quantity < item.quantity) plan.reduced.push(name);
    plan.add.push({ product, variant, quantity });
  });

  return plan;
}

// "A, B, C and 2 more": a message must stay short
export function listNames(names: string[], max = 3): string {
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

export { variantLabel };
