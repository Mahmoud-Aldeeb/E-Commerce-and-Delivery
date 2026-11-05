import type { DeliveryEta } from "@/types";

const clock = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

export const formatClock = (iso: string): string => clock.format(new Date(iso));

// 45 -> "45 min", 75 -> "1 h 15 min", 120 -> "2 h"
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// "18-30 min", or "1 h to 1 h 30 min" when the wait is long
export function formatEtaRange(
  eta: Pick<DeliveryEta, "minMinutes" | "maxMinutes">,
): string {
  if (eta.maxMinutes < 60) return `${eta.minMinutes}-${eta.maxMinutes} min`;
  return `${formatDuration(eta.minMinutes)} to ${formatDuration(eta.maxMinutes)}`;
}
