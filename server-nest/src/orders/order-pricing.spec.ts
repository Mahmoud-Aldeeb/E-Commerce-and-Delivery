import { describe, expect, it } from 'vitest';
import {
  calculateTotals,
  DELIVERY_FEE,
  FREE_DELIVERY_ABOVE,
  TAX_RATE,
} from './order-pricing.js';

describe('the agreed numbers', () => {
  // An alarm: if someone changes a number by mistake, this fails and says which one
  it('are 20, 1.99 and 8%', () => {
    expect(FREE_DELIVERY_ABOVE).toBe(20);
    expect(DELIVERY_FEE).toBe(1.99);
    expect(TAX_RATE).toBe(0.08);
  });
});

describe('calculateTotals', () => {
  it('adds delivery and tax to a small order', () => {
    expect(calculateTotals(10)).toEqual({
      subtotal: 10,
      discount: 0,
      deliveryFee: 1.99,
      tax: 0.8,
      total: 12.79,
    });
  });

  it('charges delivery when the subtotal is exactly 20 (free delivery starts ABOVE 20)', () => {
    expect(calculateTotals(20)).toEqual({
      subtotal: 20,
      discount: 0,
      deliveryFee: 1.99,
      tax: 1.6,
      total: 23.59,
    });
  });

  it('makes delivery free just above 20', () => {
    expect(calculateTotals(20.01)).toEqual({
      subtotal: 20.01,
      discount: 0,
      deliveryFee: 0,
      tax: 1.6,
      total: 21.61,
    });
  });

  it('makes delivery free for a big order', () => {
    expect(calculateTotals(25)).toEqual({
      subtotal: 25,
      discount: 0,
      deliveryFee: 0,
      tax: 2,
      total: 27,
    });
  });

  it('rounds the tax to the cent', () => {
    // 12.34 * 8% = 0.9872, which must become 0.99
    expect(calculateTotals(12.34)).toEqual({
      subtotal: 12.34,
      discount: 0,
      deliveryFee: 1.99,
      tax: 0.99,
      total: 15.32,
    });
  });

  it('removes floating-point noise from the subtotal', () => {
    // In JavaScript 0.1 + 0.2 is 0.30000000000000004
    expect(calculateTotals(0.1 + 0.2).subtotal).toBe(0.3);
  });

  it('does not give free delivery to a noisy sum that is really 20.00', () => {
    expect(calculateTotals(0.1 + 0.2 + 19.7).deliveryFee).toBe(1.99);
  });
});

describe('calculateTotals with a discount', () => {
  it('takes the discount off the items, and keeps delivery free while the rest is above 20', () => {
    // 30 - 5 = 25: still above 20
    expect(calculateTotals(30, 5)).toEqual({
      subtotal: 30,
      discount: 5,
      deliveryFee: 0,
      tax: 2,
      total: 27,
    });
  });

  it('charges delivery when the discount brings the items down to 20 or less', () => {
    // 30 - 10 = 20 exactly: delivery starts ABOVE 20
    expect(calculateTotals(30, 10)).toEqual({
      subtotal: 30,
      discount: 10,
      deliveryFee: 1.99,
      tax: 1.6,
      total: 23.59,
    });
    // 25 - 10 = 15
    expect(calculateTotals(25, 10)).toEqual({
      subtotal: 25,
      discount: 10,
      deliveryFee: 1.99,
      tax: 1.2,
      total: 18.19,
    });
  });

  it('never discounts more than the items cost: the total stays above zero', () => {
    expect(calculateTotals(10, 50)).toEqual({
      subtotal: 10,
      discount: 10,
      deliveryFee: 1.99,
      tax: 0,
      total: 1.99,
    });
  });

  it('ignores a negative discount', () => {
    expect(calculateTotals(10, -5)).toEqual({
      subtotal: 10,
      discount: 0,
      deliveryFee: 1.99,
      tax: 0.8,
      total: 12.79,
    });
  });

  it('rounds the discount to the cent', () => {
    // 20 - 0.3 = 19.7. Tax: 19.7 * 8% = 1.576, which must become 1.58
    expect(calculateTotals(20, 0.1 + 0.2)).toEqual({
      subtotal: 20,
      discount: 0.3,
      deliveryFee: 1.99,
      tax: 1.58,
      total: 23.27,
    });
  });
});
