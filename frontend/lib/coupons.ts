import { formatDateTime, formatPrice } from "@/lib/format";
import type { AdminCoupon } from "@/lib/queries/coupons";

export type CouponState =
  | "active"
  | "inactive"
  | "scheduled"
  | "expired"
  | "exhausted";

// What the admin sees about a coupon right now. The order of the checks is the API's
export function couponState(
  coupon: Pick<
    AdminCoupon,
    "isActive" | "startsAt" | "expiresAt" | "usageLimit" | "redeemedCount"
  >,
  now = new Date(),
): CouponState {
  if (!coupon.isActive) return "inactive";
  if (coupon.startsAt && now.getTime() < new Date(coupon.startsAt).getTime())
    return "scheduled";
  if (coupon.expiresAt && now.getTime() >= new Date(coupon.expiresAt).getTime())
    return "expired";
  if (coupon.usageLimit !== null && coupon.redeemedCount >= coupon.usageLimit)
    return "exhausted";
  return "active";
}

export function describeDiscount(
  coupon: Pick<AdminCoupon, "type" | "value" | "maxDiscount">,
): string {
  if (coupon.type === "FIXED") return `${formatPrice(coupon.value)} off`;
  const cap =
    coupon.maxDiscount !== null
      ? ` (up to ${formatPrice(coupon.maxDiscount)})`
      : "";
  return `${coupon.value}% off${cap}`;
}

export function describeConditions(
  coupon: Pick<
    AdminCoupon,
    "minSubtotal" | "perUserLimit" | "startsAt" | "expiresAt"
  >,
): string[] {
  const lines: string[] = [];
  if (coupon.minSubtotal !== null)
    lines.push(`Orders of ${formatPrice(coupon.minSubtotal)} or more`);
  if (coupon.perUserLimit !== null) {
    lines.push(`${coupon.perUserLimit} per customer`);
  }
  if (coupon.startsAt) lines.push(`From ${formatDateTime(coupon.startsAt)}`);
  if (coupon.expiresAt) lines.push(`Until ${formatDateTime(coupon.expiresAt)}`);
  return lines;
}

const pad = (value: number) => String(value).padStart(2, "0");

// An ISO date -> what a datetime-local input shows (the time of the admin's device)
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// What a datetime-local input gives -> an ISO date for the API (null when empty)
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
