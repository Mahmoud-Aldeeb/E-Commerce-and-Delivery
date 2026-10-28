import { statusColors } from "@/config/site";

export default function OrderStatusBadge({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  // Unknown statuses (the admin can set any text) fall back to a neutral color
  const colors = statusColors[status] ?? "bg-gray-100 text-gray-700";

  return <span className={`badge ${colors} ${className}`}>{status}</span>;
}