import { describe, expect, it } from 'vitest';
import { orderNumber } from './order-number.js';

describe('orderNumber', () => {
  it('is the last 8 characters of the id, in capitals, after a #', () => {
    expect(orderNumber('686fb482-3148-45cf-ab3a-ecaaf4c489a5')).toBe(
      '#F4C489A5',
    );
  });
});
