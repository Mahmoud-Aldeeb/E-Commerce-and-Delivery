// The order rules that decide how much a customer pays: ONE place for the numbers
// and ONE function that uses them. The web app keeps a copy (lib/pricing.ts): change both together.
export const FREE_DELIVERY_ABOVE = 20; // an amount ABOVE this (not equal) gets free delivery
export const DELIVERY_FEE = 1.99;
export const TAX_RATE = 0.08;

export const roundToCents = (value: number) => Math.round(value * 100) / 100;

export function calculateTotals(rawSubtotal: number, rawDiscount = 0) {
  // A sum of prices carries tiny binary noise (0.1 + 0.2 = 0.30000000000000004).
  // Rounding first keeps a subtotal that is really 20.00 from counting as "above 20"
  const subtotal = roundToCents(rawSubtotal);

  // A discount is never negative, and never more than the items cost
  const discount = Math.min(Math.max(roundToCents(rawDiscount), 0), subtotal);

  // What the customer pays for the items. Delivery and tax work on THIS amount
  const payable = roundToCents(subtotal - discount);

  const deliveryFee = payable > FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const tax = roundToCents(payable * TAX_RATE);
  const total = roundToCents(payable + deliveryFee + tax);

  return { subtotal, discount, deliveryFee, tax, total };
}
