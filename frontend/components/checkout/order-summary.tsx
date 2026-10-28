import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import type { calculateTotals } from "@/lib/pricing";

interface OrderSummaryProps {
  itemCount: number;
  totals: ReturnType<typeof calculateTotals>;
}

export default function OrderSummary({ itemCount, totals }: OrderSummaryProps) {
  const freeDelivery = totals.deliveryFee === 0;
  const remaining = siteConfig.freeDeliveryThreshold - totals.subtotal;

  return (
    <aside className="card h-fit p-5 lg:sticky lg:top-32" aria-label="Order summary">
      <h2 className="mb-4 text-base font-semibold">Order summary</h2>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-soft">
            Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
          </dt>
          <dd>{formatPrice(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">Delivery</dt>
          <dd>{freeDelivery ? <span className="text-success">Free</span> : formatPrice(totals.deliveryFee)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">Tax</dt>
          <dd>{formatPrice(totals.tax)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatPrice(totals.total)}</dd>
        </div>
      </dl>

      {!freeDelivery && (
        <p className="mt-4 rounded-control bg-primary-50 px-3 py-2 text-xs text-primary-800">
          Add {formatPrice(remaining)} more to get free delivery.
        </p>
      )}
    </aside>
  );
}