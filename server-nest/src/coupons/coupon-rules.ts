import { roundToCents } from '../orders/order-pricing.js';

export type CouponKind = 'PERCENT' | 'FIXED';

// The fields of a coupon that decide whether it works
export interface CouponRule {
  isActive: boolean;
  type: CouponKind;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number | null;
}

// What is true about THIS order and THIS customer right now
export interface CouponContext {
  now: Date;
  /** The items of the order, before the discount */
  subtotal: number;
  /** Orders that hold a use of the coupon (all customers) */
  redeemedTotal: number;
  /** The same, for this customer only */
  redeemedByUser: number;
}

export type CouponCheck =
  { ok: true; discount: number } | { ok: false; message: string };

const fail = (message: string): CouponCheck => ({ ok: false, message });

// "welcome10 " and "WELCOME10" are the same code
export const normalizeCode = (code: string) => code.trim().toUpperCase();

export function computeDiscount(
  coupon: Pick<CouponRule, 'type' | 'value' | 'maxDiscount'>,
  subtotal: number,
): number {
  const wanted =
    coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  const capped =
    coupon.type === 'PERCENT' && coupon.maxDiscount !== null
      ? Math.min(wanted, coupon.maxDiscount)
      : wanted;
  // Never more than the items cost
  return roundToCents(Math.min(capped, subtotal));
}

// The first rule that fails gives the message. Dates are compared as numbers
export function evaluateCoupon(
  coupon: CouponRule,
  context: CouponContext,
): CouponCheck {
  const { now, subtotal, redeemedTotal, redeemedByUser } = context;

  if (!coupon.isActive) return fail('This code is not valid');
  if (coupon.startsAt && now.getTime() < coupon.startsAt.getTime()) {
    return fail('This code is not valid yet');
  }
  if (coupon.expiresAt && now.getTime() >= coupon.expiresAt.getTime()) {
    return fail('This code has expired');
  }
  if (coupon.usageLimit !== null && redeemedTotal >= coupon.usageLimit) {
    return fail('This code has reached its usage limit');
  }
  if (coupon.perUserLimit !== null && redeemedByUser >= coupon.perUserLimit) {
    return fail('You have already used this code');
  }
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) {
    return fail(
      `This code needs an order of at least $${coupon.minSubtotal.toFixed(2)}`,
    );
  }

  const discount = computeDiscount(coupon, subtotal);
  if (discount <= 0)
    return fail('This code does not give a discount on this order');

  return { ok: true, discount };
}
