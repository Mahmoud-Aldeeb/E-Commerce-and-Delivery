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
      deliveryFee: 1.99,
      tax: 0.8,
      total: 12.79,
    });
  });

  it('charges delivery when the subtotal is exactly 20 (free delivery starts ABOVE 20)', () => {
    expect(calculateTotals(20)).toEqual({
      subtotal: 20,
      deliveryFee: 1.99,
      tax: 1.6,
      total: 23.59,
    });
  });

  it('makes delivery free just above 20', () => {
    expect(calculateTotals(20.01)).toEqual({
      subtotal: 20.01,
      deliveryFee: 0,
      tax: 1.6,
      total: 21.61,
    });
  });

  it('makes delivery free for a big order', () => {
    expect(calculateTotals(25)).toEqual({
      subtotal: 25,
      deliveryFee: 0,
      tax: 2,
      total: 27,
    });
  });

  it('rounds the tax to the cent', () => {
    // 12.34 * 8% = 0.9872, which must become 0.99
    expect(calculateTotals(12.34)).toEqual({
      subtotal: 12.34,
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
