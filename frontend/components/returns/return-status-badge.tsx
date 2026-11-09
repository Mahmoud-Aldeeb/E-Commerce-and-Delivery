import { RETURN_STATUS_BADGE, RETURN_STATUS_TEXT } from "@/lib/returns";
import type { ReturnStatus } from "@/types";

export default function ReturnStatusBadge({
  status,
  className = "",
}: {
  status: ReturnStatus;
  className?: string;
}) {
  return <span className={`badge ${RETURN_STATUS_BADGE[status]} ${className}`}>{RETURN_STATUS_TEXT[status]}</span>;
}