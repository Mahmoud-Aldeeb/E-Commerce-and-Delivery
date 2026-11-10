import { describe, expect, it } from 'vitest';
import {
  orderConfirmationEmail,
  type OrderEmailData,
} from './email-templates.js';

// 2 watches: 20 + 1.99 delivery + 1.60 tax = $23.59
const order = (overrides: Partial<OrderEmailData> = {}): OrderEmailData => ({
  number: '#A1B2C3D4',
  customerName: 'Mona',
  customerPhone: '+20 101 234 5678',
  items: [{ name: 'Watch', price: 10, quantity: 2 }],
  subtotal: 20,
  discount: 0,
  deliveryFee: 1.99,
  tax: 1.6,
  total: 23.59,
  paymentMethod: 'cash',
  address: {
    label: 'Home',
    address: '12 Nile St',
    city: 'Cairo',
    state: 'Cairo',
    zip: '11511',
  },
  orderUrl: 'https://shop.test/orders/o1',
  ...overrides,
});

describe('the confirmation email with the store wallet', () => {
  it('a cash order says what the wallet paid and what to pay the courier', () => {
    const html = orderConfirmationEmail(order({ walletAmountUsed: 5 }));

    expect(html).toContain('$5.00 was paid from your store wallet');
    expect(html).toContain('Pay $18.59 in cash');
    expect(html).toContain('Paid from your wallet');
    expect(html).toContain('-$5.00');
    expect(html).toContain('goes back to your wallet');
  });

  it('a card order says what the wallet paid and what the card paid', () => {
    const html = orderConfirmationEmail(
      order({ paymentMethod: 'card', walletAmountUsed: 5 }),
    );

    expect(html).toContain('$5.00 from your store wallet and $18.59 by card');
    expect(html).toContain('a card payment is refunded in full');
  });

  it('an order the wallet paid in full says nothing is left to pay', () => {
    const html = orderConfirmationEmail(
      order({ paymentMethod: 'wallet', walletAmountUsed: 23.59 }),
    );

    expect(html).toContain('Paid from your store wallet.');
    expect(html).not.toContain('in cash');
  });

  it('a cash order without the wallet does not change', () => {
    const html = orderConfirmationEmail(order());

    expect(html).toContain('Pay $23.59 in cash');
    expect(html.toLowerCase()).not.toContain('wallet');
  });

  it('a card order without the wallet does not change', () => {
    const html = orderConfirmationEmail(
      order({ paymentMethod: 'card', walletAmountUsed: 0 }),
    );

    expect(html).toContain('Paid by card.');
    expect(html.toLowerCase()).not.toContain('wallet');
  });
});
