import { FINISHED_STATUSES } from '../common/constants/order-status.constants.js';
import type { Prisma } from '../generated/prisma/client.js';

export const ADMIN_ORDER_TABS = [
  'all',
  'needs-courier',
  'in-progress',
  'delivered',
  'cancelled',
] as const;

export type AdminOrderTab = (typeof ADMIN_ORDER_TABS)[number];

// What each tab of the admin orders page means, as a database condition
export const ADMIN_TAB_FILTERS: Record<AdminOrderTab, Prisma.OrderWhereInput> =
  {
    all: {},
    'needs-courier': {
      deliveryPartnerId: null,
      status: { notIn: FINISHED_STATUSES },
    },
    'in-progress': {
      deliveryPartnerId: { not: null },
      status: { notIn: FINISHED_STATUSES },
    },
    delivered: { status: 'Delivered' },
    cancelled: { status: 'Cancelled' },
  };
