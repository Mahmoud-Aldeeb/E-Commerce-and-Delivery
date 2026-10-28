import { siteConfig } from "@/config/site";

// These two must match the order rules in the API (api: src/orders/order-pricing.ts)
export const DELIVERY_FEE = 1.99;
export const TAX_RATE = 0.08;

const round2 = (value: number) => Math.round(value * 100) / 100;

// Same formulas as the API, so the cart shows the number the customer will really pay
export function calculateTotals(rawSubtotal: number) {
  const subtotal = round2(rawSubtotal);
  const deliveryFee =
    subtotal > siteConfig.freeDeliveryThreshold ? 0 : DELIVERY_FEE;
  const tax = round2(subtotal * TAX_RATE);
  const total = round2(subtotal + deliveryFee + tax);
  return { subtotal, deliveryFee, tax, total };
}
