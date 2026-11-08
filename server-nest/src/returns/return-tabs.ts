import type { Prisma } from '../generated/prisma/client.js';

export const RETURN_TABS = [
  'all',
  'requested',
  'approved',
  'completed',
  'declined',
  'refund-failed',
] as const;
export type ReturnTab = (typeof RETURN_TABS)[number];

export const RETURN_TAB_FILTERS: Record<
  ReturnTab,
  Prisma.ReturnRequestWhereInput
> = {
  all: {},
  requested: { status: 'REQUESTED' },
  approved: { status: 'APPROVED' },
  completed: { status: 'COMPLETED' },
  declined: { status: { in: ['REJECTED', 'CANCELLED'] } },
  // A completed return whose money did not go back: the refund failed, or the process stopped before
  // it was recorded (a card return with no refund status). A cash return is "refunded" when it completes
  'refund-failed': {
    status: 'COMPLETED',
    OR: [
      { refundStatus: 'failed' },
      { refundStatus: null, order: { paymentMethod: 'card' } },
    ],
  },
};
