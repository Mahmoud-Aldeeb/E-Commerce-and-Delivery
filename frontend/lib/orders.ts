import type { Order } from "@/types";

// Same statuses as the API: an order in one of these is finished
export const FINISHED_STATUSES = ["Delivered", "Cancelled"];

// The delivery code is shown to the customer only while a courier is involved
export const OTP_STATUSES = ["Assigned", "Packed", "Out for Delivery"];

export const isActiveOrder = (order: Pick<Order, "status">): boolean =>
  !FINISHED_STATUSES.includes(order.status);

// "#A1B2C3D4": the last 8 characters of the id, easy to read out loud
export const orderNumber = (id: string): string =>
  `#${id.slice(-8).toUpperCase()}`;

// A card order stays unpaid until Stripe confirms the payment (the API webhook marks it)
export const awaitingPayment = (
  order: Pick<Order, "paymentMethod" | "isPaid">,
): boolean => order.paymentMethod === "card" && !order.isPaid;

export const paymentLabel = (method: string): string =>
  method === "card"
    ? "Card"
    : method === "wallet"
      ? "Store wallet"
      : "Cash on delivery";

// What the courier takes from the hand of the customer: nothing for a card order or for an order the
// wallet paid in full, and for a cash order the total minus what the wallet paid (in cents)
export const cashToCollect = (
  order: Pick<Order, "paymentMethod" | "total" | "walletAmountUsed">,
): number => {
  if (order.paymentMethod === "card" || order.paymentMethod === "wallet")
    return 0;
  const cents =
    Math.round(order.total * 100) -
    Math.round((order.walletAmountUsed ?? 0) * 100);
  return Math.max(cents, 0) / 100;
};

// Total quantity, not the number of lines: 2 lines of 3 each = 6 items
export const itemCount = (order: Pick<Order, "items">): number =>
  order.items.reduce((sum, item) => sum + item.quantity, 0);

export interface MapPoint {
  lat: number;
  lng: number;
}

// Valid coordinates or null. Missing values and the (0, 0) placeholder count as "no location"
export function toMapPoint(
  value: { lat?: unknown; lng?: unknown } | null | undefined,
): MapPoint | null {
  if (!value || value.lat == null || value.lng == null) return null;

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    (lat === 0 && lng === 0)
  )
    return null;

  return { lat, lng };
}

// The customer can cancel until the order is packed. The API enforces the same rule:
// this list only decides whether the button is shown
export const CUSTOMER_CANCELLABLE_STATUSES = [
  "Placed",
  "Confirmed",
  "Assigned",
];

export const canCustomerCancel = (
  order: Pick<Order, "status" | "paymentMethod" | "isPaid">,
): boolean =>
  CUSTOMER_CANCELLABLE_STATUSES.includes(order.status) &&
  !awaitingPayment(order);
