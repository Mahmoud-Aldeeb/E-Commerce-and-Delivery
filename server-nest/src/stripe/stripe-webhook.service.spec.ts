import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { StripeWebhookService } from './stripe-webhook.service.js';

// The service imports these only so Nest can inject them: the tests hand it fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../inngest/inngest.service.js', () => ({
  InngestService: class InngestService {},
}));
vi.mock('./stripe.service.js', () => ({
  StripeService: class StripeService {},
}));
vi.mock('../orders/order-cancellation.service.js', () => ({
  OrderCancellationService: class OrderCancellationService {},
}));

afterEach(() => {
  vi.restoreAllMocks(); // puts the real Logger methods back
});

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

// The kind of event Stripe sends: only the fields the service reads
const paymentEvent = (type: string) =>
  ({ type, data: { object: { id: 'pi_1' } } }) as never;

// The order Stripe just confirmed the payment of: two items
const order = {
  id: 'o1',
  items: [
    { product: 'a', quantity: 2 },
    { product: 'b', quantity: 1 },
  ],
};

function setup() {
  const tx = {
    order: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn(),
    },
    // takeStock is the REAL function: it calls this, and counts what comes back
    product: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };

  const prisma = {
    $transaction: vi.fn(async (work: (client: unknown) => unknown) => work(tx)),
    order: { deleteMany: vi.fn() },
  };

  const stripe = {
    client: {
      webhooks: { constructEvent: vi.fn() },
      checkout: {
        // The order id was stored in the Checkout Session when the order was created
        sessions: {
          list: vi
            .fn()
            .mockResolvedValue({ data: [{ metadata: { orderId: 'o1' } }] }),
        },
      },
    },
  };

  const inngest = { sendSafely: vi.fn() };
  const config = { get: vi.fn().mockReturnValue('whsec_test') };
  const cancellation = { cancelOutOfStock: vi.fn() };

  const logs = {
    warn: vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined),
    error: vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined),
  };
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

  const service = new StripeWebhookService(
    stripe as never,
    prisma as never,
    inngest as never,
    config as never,
    cancellation as never,
  );
  return { service, tx, prisma, stripe, inngest, config, cancellation, logs };
}

describe('constructEvent', () => {
  it('returns the event when the signature is genuine', () => {
    const { service, stripe, config } = setup();
    const event = { id: 'evt_1', type: 'payment_intent.succeeded' };
    stripe.client.webhooks.constructEvent.mockReturnValue(event);
    const body = Buffer.from('{}');

    expect(service.constructEvent(body, 't=1,v1=abc')).toBe(event);
    expect(config.get).toHaveBeenCalledWith('STRIPE_WEBHOOK_SECRET');
    expect(stripe.client.webhooks.constructEvent).toHaveBeenCalledWith(
      body,
      't=1,v1=abc',
      'whsec_test',
    );
  });

  it('refuses a request whose signature does not verify', () => {
    const { service, stripe, logs } = setup();
    stripe.client.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const call = () => service.constructEvent(Buffer.from('{}'), 't=1,v1=fake');

    expect(call).toThrow(BadRequestException);
    expect(call).toThrow('Webhook signature verification failed');
    expect(logs.warn).toHaveBeenCalled();
  });

  it('refuses a request without a body', () => {
    const { service, stripe } = setup();
    const call = () => service.constructEvent(undefined, 't=1,v1=abc');

    expect(call).toThrow(BadRequestException);
    expect(call).toThrow('Missing signature or body');
    expect(stripe.client.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it('refuses a request without a signature', () => {
    const { service, stripe } = setup();
    const call = () => service.constructEvent(Buffer.from('{}'), undefined);

    expect(call).toThrow(BadRequestException);
    expect(call).toThrow('Missing signature or body');
    expect(stripe.client.webhooks.constructEvent).not.toHaveBeenCalled();
  });

  it('fails loudly when the webhook secret is not configured', () => {
    const { service, config, logs } = setup();
    config.get.mockReturnValue(undefined);
    const call = () => service.constructEvent(Buffer.from('{}'), 't=1,v1=abc');

    expect(call).toThrow(InternalServerErrorException);
    expect(call).toThrow('Webhook secret not configured');
    expect(logs.error).toHaveBeenCalled();
  });
});

describe('payment_intent.succeeded', () => {
  it('marks the order paid, takes the stock and sends the events', async () => {
    const { service, tx, stripe, inngest, cancellation } = setup();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);

    await service.handleEvent(paymentEvent('payment_intent.succeeded'));

    expect(stripe.client.checkout.sessions.list).toHaveBeenCalledWith({
      payment_intent: 'pi_1',
    });
    // Only the FIRST delivery of this event flips isPaid from false
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', isPaid: false },
      data: { isPaid: true, paymentIntentId: 'pi_1' },
    });
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'a', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'b', stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    expect(inngest.sendSafely).toHaveBeenCalledWith([
      { name: 'order/placed', data: { orderId: 'o1' } },
      { name: 'inventory/stock.updated', data: { productId: 'a' } },
      { name: 'inventory/stock.updated', data: { productId: 'b' } },
    ]);
    expect(cancellation.cancelOutOfStock).not.toHaveBeenCalled();
  });

  it('does nothing when Stripe sends the same event again (stock is never taken twice)', async () => {
    const { service, tx, inngest, cancellation } = setup();
    tx.order.updateMany.mockResolvedValue({ count: 0 }); // the first delivery already marked it paid

    await service.handleEvent(paymentEvent('payment_intent.succeeded'));

    expect(tx.order.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(inngest.sendSafely).not.toHaveBeenCalled();
    expect(cancellation.cancelOutOfStock).not.toHaveBeenCalled();
  });

  it('cancels and refunds when an item sold out after the customer paid', async () => {
    const { service, tx, inngest, cancellation } = setup();
    tx.order.findUniqueOrThrow.mockResolvedValue(order);
    tx.product.updateMany.mockResolvedValue({ count: 0 }); // no stock: the real takeStock throws

    await service.handleEvent(paymentEvent('payment_intent.succeeded')); // and does not fail

    expect(cancellation.cancelOutOfStock).toHaveBeenCalledWith('o1', 'pi_1');
    expect(inngest.sendSafely).not.toHaveBeenCalled();
  });

  it('lets an unexpected error through, so Stripe tries the event again', async () => {
    const { service, tx, cancellation } = setup();
    tx.order.findUniqueOrThrow.mockRejectedValue(new Error('database is down'));

    const error = await failureOf(
      service.handleEvent(paymentEvent('payment_intent.succeeded')),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty('message', 'database is down');
    expect(cancellation.cancelOutOfStock).not.toHaveBeenCalled();
  });

  it('does nothing when the payment has no checkout session', async () => {
    const { service, stripe, prisma, logs } = setup();
    stripe.client.checkout.sessions.list.mockResolvedValue({ data: [] });

    await service.handleEvent(paymentEvent('payment_intent.succeeded'));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logs.warn).toHaveBeenCalled();
  });
});

describe('the other events', () => {
  it('deletes the unpaid order of a cancelled payment, and never a paid one', async () => {
    const { service, prisma } = setup();

    await service.handleEvent(paymentEvent('payment_intent.canceled'));

    expect(prisma.order.deleteMany).toHaveBeenCalledWith({
      where: { id: 'o1', isPaid: false },
    });
  });

  it('deletes nothing when the cancelled payment has no checkout session', async () => {
    const { service, stripe, prisma } = setup();
    stripe.client.checkout.sessions.list.mockResolvedValue({ data: [] });

    await service.handleEvent(paymentEvent('payment_intent.canceled'));

    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });

  it('only logs a failed attempt: the customer can try again', async () => {
    const { service, prisma, stripe } = setup();

    await service.handleEvent(paymentEvent('payment_intent.payment_failed'));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
    expect(stripe.client.checkout.sessions.list).not.toHaveBeenCalled();
  });

  it('ignores an event type it does not know', async () => {
    const { service, prisma, stripe } = setup();

    await service.handleEvent(paymentEvent('customer.created'));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
    expect(stripe.client.checkout.sessions.list).not.toHaveBeenCalled();
  });
});
