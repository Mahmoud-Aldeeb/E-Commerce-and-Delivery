// Statuses in which the customer can still cancel: before the order is packed.
// The web app has the same list (lib/orders.ts) only to hide the button: this one decides.
export const CUSTOMER_CANCELLABLE_STATUSES = [
  'Placed',
  'Confirmed',
  'Assigned',
];

// Stripe identifiers: useful for the store, pointless for the customer or the courier
export const PRIVATE_ORDER_FIELDS = {
  paymentIntentId: true,
  refundId: true,
} as const;

export function omitPrivateOrderFields<
  T extends { paymentIntentId: string | null; refundId: string | null },
>(order: T) {
  const {
    paymentIntentId: _paymentIntentId,
    refundId: _refundId,
    ...rest
  } = order;
  return rest;
}
