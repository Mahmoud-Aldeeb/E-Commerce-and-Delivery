import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ACTIVE_STATUSES } from '../common/constants/order-status.constants.js';
import { DeliveryService } from './delivery.service.js';

// The service imports these only so Nest can inject them (or so it can run): fakes instead
vi.mock('../prisma/prisma.service.js', () => ({
  PrismaService: class PrismaService {},
}));
vi.mock('../orders/order-cancellation.service.js', () => ({
  OrderCancellationService: class OrderCancellationService {},
}));
vi.mock('bcrypt', () => ({
  default: { compare: async () => false, hash: async () => 'hash' },
}));

const NOW = new Date('2026-11-01T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// Waits for a call that must fail and gives back the error
const failureOf = (call: Promise<unknown>) =>
  call.then(
    () => undefined,
    (caught: unknown) => caught,
  );

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'o1',
  status: 'Out for Delivery',
  deliveryOtp: '123456',
  statusHistory: [],
  ...overrides,
});

function setup() {
  const prisma = {
    order: {
      findFirst: vi.fn(),
      update: vi.fn(async ({ data }: { data: object }) => ({
        id: 'o1',
        ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const service = new DeliveryService(
    prisma as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe('completeDelivery', () => {
  it('delivers the order with the right code: the status, the moment, and the code is used up', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(order());

    const result = await service.completeDelivery('d1', 'o1', {
      otp: '123456',
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 'o1', deliveryPartnerId: 'd1' },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        status: 'Delivered',
        statusHistory: [
          {
            status: 'Delivered',
            note: 'Delivered by partner',
            timestamp: NOW.toISOString(),
          },
        ],
        deliveryOtp: '',
        // The cash accounting counts the order from this moment
        deliveredAt: NOW,
      },
      // The code never goes back to the courier
      omit: { deliveryOtp: true },
    });
    expect(result.message).toBe('Delivery completed successfully');
  });

  it('refuses a wrong code and changes nothing', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(order());

    const error = await failureOf(
      service.completeDelivery('d1', 'o1', { otp: '000000' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'Invalid OTP');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('refuses an order that is not assigned to this courier', async () => {
    const { service, prisma } = setup();
    prisma.order.findFirst.mockResolvedValue(null);

    const error = await failureOf(
      service.completeDelivery('d2', 'o1', { otp: '123456' }),
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).toHaveProperty('message', 'Invalid Request');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it.each([['Delivered'], ['Cancelled']])(
    'refuses an order that is already %s',
    async (status) => {
      const { service, prisma } = setup();
      prisma.order.findFirst.mockResolvedValue(order({ status }));

      const error = await failureOf(
        service.completeDelivery('d1', 'o1', { otp: '123456' }),
      );

      expect(error).toHaveProperty('message', 'Invalid Request');
      expect(prisma.order.update).not.toHaveBeenCalled();
    },
  );
});

describe('updateLocation', () => {
  it('saves the position with the moment it was recorded, for an active order of this courier only', async () => {
    const { service, prisma } = setup();

    const result = await service.updateLocation('d1', 'o1', {
      lat: 30.1,
      lng: 31.2,
    });

    // The arrival estimate of the customer needs this moment: it must always be saved
    const liveLocation = { lat: 30.1, lng: 31.2, updatedAt: NOW.toISOString() };
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'o1',
        deliveryPartnerId: 'd1',
        status: { in: ACTIVE_STATUSES },
      },
      data: { liveLocation },
    });
    expect(result).toEqual({ success: true, liveLocation });
  });

  it('answers "not found" when the order is not an active order of this courier', async () => {
    const { service, prisma } = setup();
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const error = await failureOf(
      service.updateLocation('d1', 'o1', { lat: 30.1, lng: 31.2 }),
    );

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error).toHaveProperty('message', 'Delivery not found or not active');
  });
});
