import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATUSES,
  ADMIN_SETTABLE_STATUSES,
  FINISHED_STATUSES,
} from '../common/constants/order-status.constants.js';
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  omitPrivateOrderFields,
  PRIVATE_ORDER_FIELDS,
} from './order-rules.js';

describe('order statuses', () => {
  it('lets the customer cancel only before the order is packed', () => {
    expect(CUSTOMER_CANCELLABLE_STATUSES).toEqual([
      'Placed',
      'Confirmed',
      'Assigned',
    ]);
  });

  it('never lets the customer cancel a finished order', () => {
    for (const status of CUSTOMER_CANCELLABLE_STATUSES) {
      expect(FINISHED_STATUSES).not.toContain(status);
    }
  });

  it('treats only Delivered and Cancelled as finished', () => {
    expect(FINISHED_STATUSES).toEqual(['Delivered', 'Cancelled']);
  });

  it('has no status that is both active and finished', () => {
    for (const status of ACTIVE_STATUSES) {
      expect(FINISHED_STATUSES).not.toContain(status);
    }
  });

  it('does not let an admin set Placed or Assigned by hand', () => {
    expect(ADMIN_SETTABLE_STATUSES).not.toContain('Placed');
    expect(ADMIN_SETTABLE_STATUSES).not.toContain('Assigned');
  });
});

describe('omitPrivateOrderFields', () => {
  const order = {
    id: 'o1',
    total: 27,
    paymentIntentId: 'pi_123',
    refundId: 're_456',
  };

  it('removes the Stripe identifiers and keeps everything else', () => {
    expect(omitPrivateOrderFields(order)).toEqual({ id: 'o1', total: 27 });
  });

  it('does not change the order it was given', () => {
    omitPrivateOrderFields(order);
    expect(order.paymentIntentId).toBe('pi_123');
  });

  it('hides exactly the two fields that the queries omit', () => {
    expect(Object.keys(PRIVATE_ORDER_FIELDS).sort()).toEqual([
      'paymentIntentId',
      'refundId',
    ]);
  });
});
