"use client";

import {
  KeyRoundIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  TruckIcon,
  XCircleIcon,
} from "lucide-react";
import OrderStatusBadge from "@/components/orders/order-status-badge";
import { formatAddress, formatDateTime, formatPrice } from "@/lib/format";
import { itemCount, orderNumber, toMapPoint } from "@/lib/orders";
import type { DeliveryTab } from "@/lib/queries/delivery";
import type { Order } from "@/types";

interface DeliveryCardProps {
  order: Order;
  tab: DeliveryTab;
  /** True while this order's status is being saved */
  busy: boolean;
  onAdvance: (order: Order) => void;
  onDeliver: (order: Order) => void;
  onCancel: (order: Order) => void;
}

// The next step a courier can take, by the current status
const ADVANCE_LABELS: Record<string, string> = {
  Assigned: "Mark as packed",
  Packed: "Start delivery",
};

export default function DeliveryCard({
  order,
  tab,
  busy,
  onAdvance,
  onDeliver,
  onCancel,
}: DeliveryCardProps) {
  const customer = order.user;
  const advanceLabel = ADVANCE_LABELS[order.status];
  const isCash = order.paymentMethod !== "card";
  const count = itemCount(order);

  // Exact coordinates when the order has them, the written address otherwise
  const point = toMapPoint(order.shippingAddress);
  const destination = point
    ? `${point.lat},${point.lng}`
    : encodeURIComponent(formatAddress(order.shippingAddress));
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;

  return (
    <article className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold">{orderNumber(order.id)}</span>
          <OrderStatusBadge status={order.status} />
        </div>
        <span className="text-sm font-semibold">{formatPrice(order.total)}</span>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-800">
              {(customer?.name ?? "C").charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{customer?.name ?? "Customer"}</p>
              {customer?.phone && <p className="text-xs text-ink-muted">{customer.phone}</p>}
            </div>
          </div>
          {customer?.phone && (
            <a
              href={`tel:${customer.phone}`}
              className="btn btn-secondary p-2.5"
              aria-label={`Call ${customer.name}`}
            >
              <PhoneIcon className="size-4" />
            </a>
          )}
        </div>

        <div className="flex items-start gap-3">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-primary-700" />
          <p className="flex-1 text-sm text-ink-soft">{formatAddress(order.shippingAddress)}</p>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm shrink-0"
          >
            <NavigationIcon className="size-3.5" /> Navigate
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {isCash ? (
            <span className="badge badge-warning">Collect {formatPrice(order.total)} in cash</span>
          ) : (
            <span className={`badge ${order.isPaid ? "badge-success" : "badge-warning"}`}>
              {order.isPaid ? "Paid online" : "Card payment pending"}
            </span>
          )}
          <span className="text-ink-muted">
            {count} {count === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      {tab === "active" ? (
        <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
          {advanceLabel && (
            <button onClick={() => onAdvance(order)} disabled={busy} className="btn btn-primary">
              <TruckIcon className="size-4" />
              {busy ? "Saving..." : advanceLabel}
            </button>
          )}
          {order.status === "Out for Delivery" && (
            <button onClick={() => onDeliver(order)} className="btn btn-primary">
              <KeyRoundIcon className="size-4" /> Enter delivery code
            </button>
          )}
          <button onClick={() => onCancel(order)} className="btn btn-ghost ml-auto text-danger hover:text-danger">
            <XCircleIcon className="size-4" /> Cancel
          </button>
        </div>
      ) : (
        <div className="border-t border-line px-5 py-3 text-xs text-ink-muted">
          {formatDateTime(order.updatedAt)}
        </div>
      )}
    </article>
  );
}