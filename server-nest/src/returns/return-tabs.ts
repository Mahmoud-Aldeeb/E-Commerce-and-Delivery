import type { Prisma } from '../generated/prisma/client.js';

export const RETURN_TABS = [
  'all',
  'requested',
  'approved',
  'completed',
  'declined',
  'refund-failed',
  'manual-refund',
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
  // A completed return whose card refund failed, or whose Stripe answer was never recorded
  // (every other method records its refund status when the return completes)
  'refund-failed': {
    status: 'COMPLETED',
    OR: [{ refundStatus: 'failed' }, { refundStatus: null }],
  },
  // The customer asked for a mobile wallet or InstaPay: the store has to pay it by hand
  'manual-refund': { status: 'COMPLETED', refundStatus: 'manual-pending' },
};
