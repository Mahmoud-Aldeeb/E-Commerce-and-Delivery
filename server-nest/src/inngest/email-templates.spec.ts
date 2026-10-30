import { describe, expect, it } from 'vitest';
import {
  orderConfirmationEmail,
  type OrderEmailData,
} from './email-templates.js';

// A card order of two products. 59.99 + 2 x 21.99 = 103.97, and 8% tax = 8.32
const order: OrderEmailData = {
  number: '#A1B2C3D4',
  customerName: 'Ali',
  customerPhone: '+20 101 234 5678',
  items: [
    { name: 'Smart Fitness Watch', price: 59.99, quantity: 1 },
    { name: 'Yoga Mat', price: 21.99, quantity: 2 },
  ],
  subtotal: 103.97,
  deliveryFee: 0,
  tax: 8.32,
  total: 112.29,
  paymentMethod: 'card',
  address: {
    label: 'Home',
    address: '12 Nile St',
    city: 'Cairo',
    state: 'Cairo',
    zip: '11511',
  },
  orderUrl: 'https://shop.example/orders/o1',
};

describe('orderConfirmationEmail', () => {
  it('shows the order number, the customer and every item with its line total', () => {
    const html = orderConfirmationEmail(order);

    expect(html).toContain('#A1B2C3D4');
    expect(html).toContain('Hi Ali,');
    expect(html).toContain('Smart Fitness Watch');
    expect(html).toContain('$59.99');
    expect(html).toContain('Yoga Mat');
    expect(html).toContain('$43.98'); // 2 x 21.99
  });

  it('shows the totals, and "Free" when delivery costs nothing', () => {
    const html = orderConfirmationEmail(order);

    expect(html).toContain('$103.97');
    expect(html).toContain('$8.32');
    expect(html).toContain('$112.29');
    expect(html).toContain('Free');
  });

  it('shows the delivery fee when there is one', () => {
    const html = orderConfirmationEmail({ ...order, deliveryFee: 1.99 });

    expect(html).toContain('$1.99');
    expect(html).not.toContain('Free');
  });

  it('says a card order is already paid', () => {
    const html = orderConfirmationEmail(order);

    expect(html).toContain('Paid by card');
    expect(html).not.toContain('in cash');
  });

  it('tells a cash customer how much to give the courier', () => {
    const html = orderConfirmationEmail({ ...order, paymentMethod: 'cash' });

    expect(html).toContain('Pay $112.29 in cash');
    expect(html).not.toContain('Paid by card');
  });

  it('shows the delivery address and the phone number', () => {
    const html = orderConfirmationEmail(order);

    expect(html).toContain('12 Nile St');
    expect(html).toContain('Cairo, Cairo 11511');
    expect(html).toContain('+20 101 234 5678');
  });

  it('leaves the phone line out when there is no number', () => {
    expect(
      orderConfirmationEmail({ ...order, customerPhone: null }),
    ).not.toContain('may call you');
  });

  it('links to the order page', () => {
    expect(orderConfirmationEmail(order)).toContain(
      'href="https://shop.example/orders/o1"',
    );
  });

  it('escapes what people typed, so a name cannot inject HTML into an email from our domain', () => {
    const html = orderConfirmationEmail({
      ...order,
      customerName: '<script>alert(1)</script>',
      items: [{ name: '<b>Bold</b> Watch', price: 10, quantity: 1 }],
      address: { ...order.address, address: '"><img src=x>' },
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt; Watch');
  });
});
