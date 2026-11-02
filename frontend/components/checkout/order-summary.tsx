import { siteConfig } from "@/config/site";
import { formatPrice } from "@/lib/format";
import type { calculateTotals } from "@/lib/pricing";

interface OrderSummaryProps {
  itemCount: number;
  totals: ReturnType<typeof calculateTotals>;
  /** The coupon that gives the discount, shown next to it */
  couponCode?: string | null;
  /** Lines of the cart that are NOT part of this order */
  leftInCart?: number;
  /** Opens the cart, to change what is ticked */
  onEditCart?: () => void;
  /** The coupon box */
  children?: React.ReactNode;
}

export default function OrderSummary({
  itemCount,
  totals,
  couponCode,
  leftInCart = 0,
  onEditCart,
  children,
}: OrderSummaryProps) {
  const freeDelivery = totals.deliveryFee === 0;
  // Free delivery depends on what is paid for the items, after the discount
  const remaining = siteConfig.freeDeliveryThreshold - (totals.subtotal - totals.discount);

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
        {totals.discount > 0 && (
          <div className="flex justify-between">
            <dt className="text-ink-soft">Discount{couponCode ? ` (${couponCode})` : ""}</dt>
            <dd className="text-success">-{formatPrice(totals.discount)}</dd>
          </div>
        )}
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

      {children && <div className="mt-4 border-t border-line pt-4">{children}</div>}

      {!freeDelivery && (
        <p className="mt-4 rounded-control bg-primary-50 px-3 py-2 text-xs text-primary-800">
          Add {formatPrice(Math.max(remaining, 0.01))} more to get free delivery.
        </p>
      )}

      {leftInCart > 0 && (
        <p className="mt-3 text-xs text-ink-muted">
          {leftInCart} {leftInCart === 1 ? "item stays" : "items stay"} in your cart.{" "}
          {onEditCart && (
            <button
              type="button"
              onClick={onEditCart}
              className="font-medium text-primary-700 hover:underline"
            >
              Change selection
            </button>
          )}
        </p>
      )}
    </aside>
  );
}