import Image from "next/image";
import { MapPinIcon } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { awaitingPayment, paymentLabel } from "@/lib/orders";
import type { Order } from "@/types";

export function DeliveryAddressCard({ address }: { address: Order["shippingAddress"] }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MapPinIcon className="size-4 text-primary-700" />
        Delivery address
      </h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        <span className="font-medium text-ink">{address.label}</span>
        <br />
        {address.address}
        <br />
        {address.city}, {address.state} {address.zip}
      </p>
    </section>
  );
}

export function OrderItemsCard({ order }: { order: Order }) {
  const fee = order.deliveryFee ?? 0;

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold">Items ({order.items.length})</h2>

      <ul className="space-y-3">
        {order.items.map((item, index) => (
          <li key={`${item.product}-${index}`} className="flex items-center gap-3">
            <Image
              src={item.image}
              alt={item.name}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-control bg-canvas object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-xs text-ink-muted">
                {item.quantity} × {formatPrice(item.price)}
              </p>
            </div>
            <span className="text-sm font-semibold">{formatPrice(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-soft">Subtotal</dt>
          <dd>{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">Delivery</dt>
          <dd>{fee === 0 ? <span className="text-success">Free</span> : formatPrice(fee)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">Tax</dt>
          <dd>{formatPrice(order.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatPrice(order.total)}</dd>
        </div>
        <div className="flex items-center justify-between pt-1">
          <dt className="text-ink-soft">Payment</dt>
          <dd className="flex items-center gap-2">
            {paymentLabel(order.paymentMethod)}
            {order.paymentMethod === "card" && (
              <span className={`badge ${awaitingPayment(order) ? "badge-warning" : "badge-success"}`}>
                {awaitingPayment(order) ? "Awaiting payment" : "Paid"}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}