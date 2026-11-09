import type { ReturnLine, ReturnReason, ReturnStatus } from "@/types";

// The same reasons as the API
export const RETURN_REASONS: { value: ReturnReason; label: string }[] = [
  { value: "DEFECTIVE", label: "Defective or damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "DOES_NOT_FIT", label: "Does not fit" },
  { value: "OTHER", label: "Other" },
];

export const reasonLabel = (reason: ReturnReason): string =>
  RETURN_REASONS.find((item) => item.value === reason)?.label ?? reason;

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

// "#R-AB12CD34": the last 8 characters of the id, like an order number. The R keeps the two apart
export const returnNumber = (id: string): string =>
  `#R-${id.slice(-8).toUpperCase()}`;

export const returnItemCount = (
  lines: Pick<ReturnLine, "quantity">[],
): number => lines.reduce((sum, line) => sum + line.quantity, 0);
