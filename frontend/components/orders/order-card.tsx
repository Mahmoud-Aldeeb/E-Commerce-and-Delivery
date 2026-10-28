import Image from "next/image";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import OrderStatusBadge from "@/components/orders/order-status-badge";
import { formatDate, formatPrice } from "@/lib/format";
import { isActiveOrder, itemCount, orderNumber, paymentLabel } from "@/lib/orders";
import type { Order } from "@/types";

const MAX_THUMBNAILS = 4;

export default function OrderCard({ order }: { order: Order }) {
  const active = isActiveOrder(order);
  const count = itemCount(order);
  const hiddenItems = order.items.length - MAX_THUMBNAILS;

  return (
    <Link
      href={`/orders/${order.id}`}
      className="card block p-5 transition-shadow hover:shadow-pop"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Order {orderNumber(order.id)}</p>
          <p className="mt-0.5 text-sm text-ink-muted">{formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        {order.items.slice(0, MAX_THUMBNAILS).map((item, index) => (
          <Image
            key={`${item.product}-${index}`}
            src={item.image}
            alt={item.name}
            width={56}
            height={56}
            className="size-14 rounded-control border border-line bg-canvas object-cover"
          />
        ))}
        {hiddenItems > 0 && (
          <span className="flex size-14 items-center justify-center rounded-control bg-canvas text-xs font-semibold text-ink-soft">
            +{hiddenItems}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
        <div className="text-ink-soft">
          {count} {count === 1 ? "item" : "items"} · {paymentLabel(order.paymentMethod)}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold">{formatPrice(order.total)}</span>
          <span className="flex items-center gap-0.5 font-medium text-primary-700">
            {active ? "Track" : "Details"}
            <ChevronRightIcon className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}