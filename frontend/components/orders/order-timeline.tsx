import {
  CheckIcon,
  ClockIcon,
  PackageIcon,
  TruckIcon,
  UserCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import RefundNotice from "@/components/orders/refund-notice";
import type { Order } from "@/types";

// "Confirmed" is not here on purpose: the API never sets it
const STEPS = [
  { status: "Placed", label: "Order placed", icon: ClockIcon },
  { status: "Assigned", label: "Courier assigned", icon: UserCheckIcon },
  { status: "Packed", label: "Packed", icon: PackageIcon },
  { status: "Out for Delivery", label: "Out for delivery", icon: TruckIcon },
  { status: "Delivered", label: "Delivered", icon: CheckIcon },
] as const;

// An unknown status (for example "Confirmed") is treated as the first step
const stepIndex = (status: string): number =>
  Math.max(
    STEPS.findIndex((step) => step.status === status),
    0,
  );

// The LAST time the order reached this status (a status can be repeated, for example on reassignment)
function reachedAt(order: Order, status: string): string | null {
  const entry = [...order.statusHistory].reverse().find((item) => item.status === status);
  if (entry) return entry.timestamp;
  return status === "Placed" ? order.createdAt : null;
}

export default function OrderTimeline({ order }: { order: Order }) {
  if (order.status === "Cancelled") {
    const when = reachedAt(order, "Cancelled");

    return (
      <section className="card border-danger/30 p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
            <XCircleIcon className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">This order was cancelled</h2>
            {when && <p className="text-sm text-ink-muted">{formatDateTime(when)}</p>}
          </div>
        </div>
        <div className="mt-4 empty:hidden">
          <RefundNotice order={order} />
        </div>
      </section>
    );
  }

  const current = stepIndex(order.status);

  return (
    <section className="card p-6">
      <h2 className="mb-5 text-lg font-semibold">Delivery progress</h2>

      <ol>
        {STEPS.map((step, index) => {
          const done = index <= current;
          const isCurrent = index === current;
          const time = done ? reachedAt(order, step.status) : null;

          return (
            <li
              key={step.status}
              className="flex gap-4"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary-700 text-white" : "bg-canvas text-ink-muted"
                    } ${isCurrent && order.status !== "Delivered" ? "ring-4 ring-primary-100" : ""}`}
                >
                  <step.icon className="size-4" />
                </span>
                {index < STEPS.length - 1 && (
                  <span className={`my-1 w-0.5 flex-1 ${index < current ? "bg-primary-700" : "bg-line"}`} />
                )}
              </div>

              <div className="pb-6 last:pb-0">
                <p className={`text-sm font-semibold ${done ? "text-ink" : "text-ink-muted"}`}>
                  {step.label}
                </p>
                {time && <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(time)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}