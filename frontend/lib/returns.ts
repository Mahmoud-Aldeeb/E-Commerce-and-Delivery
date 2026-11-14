import type {
  ReturnLine,
  ReturnReason,
  ReturnRefundMethod,
  ReturnStatus,
} from "@/types";

// Every reason a return can have in the database. A NEW return can only be "DEFECTIVE" (the policy of
// the store: manufacturing defects only). The others stay so the returns that already exist read well
const REASON_LABELS: Record<ReturnReason, string> = {
  DEFECTIVE: "Manufacturing defect",
  WRONG_ITEM: "Wrong item",
  NOT_AS_DESCRIBED: "Not as described",
  DOES_NOT_FIT: "Does not fit",
  OTHER: "Other",
};

export const reasonLabel = (reason: ReturnReason): string =>
  REASON_LABELS[reason] ?? reason;

export const RETURN_STATUS_TEXT: Record<ReturnStatus, string> = {
  REQUESTED: "Waiting for the store",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  REJECTED: "Refused",
  CANCELLED: "Cancelled",
};

export const RETURN_STATUS_BADGE: Record<ReturnStatus, string> = {
  REQUESTED: "badge-warning",
  APPROVED: "badge-primary",
  COMPLETED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-neutral",
};

// Where a refund can go, in the words of the customer and of the store
export const REFUND_METHOD_LABELS: Record<ReturnRefundMethod, string> = {
  ORIGINAL_PAYMENT: "Back to the card",
  STORE_WALLET: "Store wallet",
  MOBILE_WALLET: "Mobile wallet",
  INSTAPAY: "InstaPay",
};

// "#R-AB12CD34": the last 8 characters of the id, like an order number. The R keeps the two apart
export const returnNumber = (id: string): string =>
  `#R-${id.slice(-8).toUpperCase()}`;

export const returnItemCount = (
  lines: Pick<ReturnLine, "quantity">[],
): number => lines.reduce((sum, line) => sum + line.quantity, 0);
