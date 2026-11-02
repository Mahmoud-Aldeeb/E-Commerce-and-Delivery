import { siteConfig } from "@/config/site";

// These two must match the order rules in the API (api: src/orders/order-pricing.ts)
export const DELIVERY_FEE = 1.99;
export const TAX_RATE = 0.08;

const round2 = (value: number) => Math.round(value * 100) / 100;

// Same formulas as the API, so the page shows the number the customer will really pay.
// Delivery and tax work on what is left AFTER the discount
export function calculateTotals(rawSubtotal: number, rawDiscount = 0) {
  const subtotal = round2(rawSubtotal);

  // A discount is never negative, and never more than the items cost
  const discount = Math.min(Math.max(round2(rawDiscount), 0), subtotal);
  const payable = round2(subtotal - discount);

  const deliveryFee =
    payable > siteConfig.freeDeliveryThreshold ? 0 : DELIVERY_FEE;
  const tax = round2(payable * TAX_RATE);
  const total = round2(payable + deliveryFee + tax);
  return { subtotal, discount, deliveryFee, tax, total };
}
