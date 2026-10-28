import type { Address } from "@/types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD", // the API charges in USD
});

export const formatPrice = (value: number | null | undefined): string =>
  currency.format(value ?? 0);

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export const formatDateTime = (iso: string): string =>
  dateTime.format(new Date(iso));
export const formatDate = (iso: string): string =>
  dateOnly.format(new Date(iso));

// Discount in percent, or 0 when there is no real discount
export const discountPercent = (
  price: number,
  originalPrice: number | null | undefined,
): number =>
  originalPrice && originalPrice > price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

// "12 Tahrir St, Cairo, Cairo 11511"
export const formatAddress = (
  value: Pick<Address, "address" | "city" | "state" | "zip">,
): string =>
  `${value.address}, ${value.city}, ${value.state} ${value.zip}`.trim();
