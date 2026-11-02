import { describe, expect, it } from 'vitest';
import {
  computeDiscount,
  evaluateCoupon,
  normalizeCode,
  type CouponContext,
  type CouponRule,
} from './coupon-rules.js';

const NOW = new Date('2026-11-01T10:00:00.000Z');

// A plain 10% coupon with no limits: each test changes only what it is about
const rule = (overrides: Partial<CouponRule> = {}): CouponRule => ({
  isActive: true,
  type: 'PERCENT',
  value: 10,
  maxDiscount: null,
  minSubtotal: null,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  perUserLimit: null,
  ...overrides,
});

const context = (overrides: Partial<CouponContext> = {}): CouponContext => ({
  now: NOW,
  subtotal: 50,
  redeemedTotal: 0,
  redeemedByUser: 0,
  ...overrides,
});

describe('normalizeCode', () => {
  it('trims and capitalizes, so "welcome10 " and "WELCOME10" are one code', () => {
    expect(normalizeCode('  welcome10 ')).toBe('WELCOME10');
  });

  it('gives an empty text for a blank code', () => {
    expect(normalizeCode('   ')).toBe('');
  });
});

describe('computeDiscount', () => {
  it('takes a percentage of the items', () => {
    expect(
      computeDiscount({ type: 'PERCENT', value: 10, maxDiscount: null }, 25),
    ).toBe(2.5);
  });

  it('rounds to the cent', () => {
    // 15% of 19.99 is 2.9985
    expect(
      computeDiscount({ type: 'PERCENT', value: 15, maxDiscount: null }, 19.99),
    ).toBe(3);
  });

  it('never goes above the maximum discount', () => {
    // 50% of 100 is 50, but the cap is 20
    expect(
      computeDiscount({ type: 'PERCENT', value: 50, maxDiscount: 20 }, 100),
    ).toBe(20);
  });

  it('takes a fixed amount off', () => {
    expect(
      computeDiscount({ type: 'FIXED', value: 5, maxDiscount: null }, 25),
    ).toBe(5);
  });

  it('never takes more than the items cost', () => {
    expect(
      computeDiscount({ type: 'FIXED', value: 30, maxDiscount: null }, 20),
    ).toBe(20);
    expect(
      computeDiscount({ type: 'PERCENT', value: 100, maxDiscount: null }, 20),
    ).toBe(20);
  });
});

describe('evaluateCoupon', () => {
  it('accepts a good coupon and gives the discount', () => {
    expect(evaluateCoupon(rule(), context())).toEqual({
      ok: true,
      discount: 5,
    });
  });

  it('refuses a coupon that is turned off', () => {
    expect(evaluateCoupon(rule({ isActive: false }), context())).toEqual({
      ok: false,
      message: 'This code is not valid',
    });
  });

  it('refuses a coupon that has not started, and accepts it from the very moment it starts', () => {
    const future = new Date('2026-11-01T10:00:01.000Z');

    expect(evaluateCoupon(rule({ startsAt: future }), context())).toEqual({
      ok: false,
      message: 'This code is not valid yet',
    });
    expect(evaluateCoupon(rule({ startsAt: NOW }), context()).ok).toBe(true);
  });

  it('refuses an expired coupon, from the very moment it expires', () => {
    const before = new Date('2026-11-01T09:59:59.000Z');

    expect(evaluateCoupon(rule({ expiresAt: NOW }), context())).toEqual({
      ok: false,
      message: 'This code has expired',
    });
    expect(evaluateCoupon(rule({ expiresAt: before }), context()).ok).toBe(
      false,
    );
    expect(
      evaluateCoupon(
        rule({ expiresAt: new Date('2026-11-01T10:00:01.000Z') }),
        context(),
      ).ok,
    ).toBe(true);
  });

  it('refuses a coupon whose total limit is reached, and accepts the last use', () => {
    expect(
      evaluateCoupon(rule({ usageLimit: 5 }), context({ redeemedTotal: 5 })),
    ).toEqual({
      ok: false,
      message: 'This code has reached its usage limit',
    });
    expect(
      evaluateCoupon(rule({ usageLimit: 5 }), context({ redeemedTotal: 4 })).ok,
    ).toBe(true);
  });

  it('refuses a customer who used the code as many times as allowed', () => {
    expect(
      evaluateCoupon(rule({ perUserLimit: 1 }), context({ redeemedByUser: 1 })),
    ).toEqual({
      ok: false,
      message: 'You have already used this code',
    });
    expect(
      evaluateCoupon(rule({ perUserLimit: 2 }), context({ redeemedByUser: 1 }))
        .ok,
    ).toBe(true);
  });

  it('has no limits when they are empty', () => {
    expect(
      evaluateCoupon(
        rule(),
        context({ redeemedTotal: 9999, redeemedByUser: 9999 }),
      ).ok,
    ).toBe(true);
  });

  it('refuses items that cost less than the minimum, and accepts exactly the minimum', () => {
    expect(
      evaluateCoupon(rule({ minSubtotal: 50 }), context({ subtotal: 49.99 })),
    ).toEqual({
      ok: false,
      message: 'This code needs an order of at least $50.00',
    });
    expect(
      evaluateCoupon(rule({ minSubtotal: 50 }), context({ subtotal: 50 })).ok,
    ).toBe(true);
  });

  it('refuses a coupon that would give no discount', () => {
    expect(
      evaluateCoupon(rule({ type: 'FIXED', value: 0 }), context()),
    ).toEqual({
      ok: false,
      message: 'This code does not give a discount on this order',
    });
  });

  it('reports the first problem when there are several', () => {
    const result = evaluateCoupon(
      rule({ expiresAt: NOW, usageLimit: 1 }),
      context({ redeemedTotal: 1 }),
    );

    expect(result).toEqual({ ok: false, message: 'This code has expired' });
  });
});
