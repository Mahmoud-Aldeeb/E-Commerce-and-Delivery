"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  MinusIcon,
  PlusIcon,
  ShoppingBagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { useCart } from "@/context/cart-context";
import { formatPrice } from "@/lib/format";
import { calculateTotals } from "@/lib/pricing";

export default function CartSidebar() {
  const { items, cartTotal, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart } =
    useCart();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // While the drawer is open: Escape closes it, the page behind does not scroll,
  // and the keyboard focus moves inside it
  useEffect(() => {
    if (!isCartOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsCartOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isCartOpen, setIsCartOpen]);

  if (!isCartOpen) return null;

  const totals = calculateTotals(cartTotal);
  const hasFreeDelivery = totals.deliveryFee === 0;
  const remainingForFree = Math.max(siteConfig.freeDeliveryThreshold - cartTotal, 0.01);
  const progress = Math.min((cartTotal / siteConfig.freeDeliveryThreshold) * 100, 100);
  const close = () => setIsCartOpen(false);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={close} aria-hidden="true" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className="animate-slide-in-right fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface shadow-pop"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line p-5">
          <div className="flex items-center gap-2">
            <ShoppingBagIcon className="size-5" />
            <h2 className="text-lg font-semibold">Your cart</h2>
            <span className="badge badge-neutral">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
          <button
            ref={closeButtonRef}
            onClick={close}
            className="btn btn-ghost p-2"
            aria-label="Close cart"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* Free delivery progress */}
        {items.length > 0 && (
          <div className="border-b border-line bg-canvas px-5 py-3">
            <p className="text-xs text-ink-soft">
              {hasFreeDelivery ? (
                <span className="font-medium text-primary-800">
                  You got free delivery!
                </span>
              ) : (
                <>
                  Add <strong>{formatPrice(remainingForFree)}</strong> more for free delivery
                </>
              )}
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-primary-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <ShoppingBagIcon className="mb-4 size-14 text-line-strong" />
              <h3 className="text-lg font-semibold">Your cart is empty</h3>
              <p className="mt-1 text-sm text-ink-soft">Add something you like.</p>
              <Link href="/products" onClick={close} className="btn btn-primary mt-5">
                Continue shopping
              </Link>
            </div>
          ) : (
            items.map((item) => {
              const atLimit = item.quantity >= (item.product.stock ?? Infinity);
              return (
                <div key={item.product.id} className="flex gap-3 rounded-card border border-line p-3">
                  <Image
                    src={item.product.image}
                    alt={item.product.name}
                    width={64}
                    height={64}
                    className="size-16 shrink-0 rounded-control bg-canvas object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${item.product.id}`}
                      onClick={close}
                      className="line-clamp-2 text-sm font-medium hover:text-primary-700"
                    >
                      {item.product.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {formatPrice(item.product.price)}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="btn btn-secondary size-7 p-0"
                          aria-label={`Decrease quantity of ${item.product.name}`}
                        >
                          <MinusIcon className="size-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          disabled={atLimit}
                          className="btn btn-secondary size-7 p-0"
                          aria-label={`Increase quantity of ${item.product.name}`}
                          title={atLimit ? "No more stock available" : undefined}
                        >
                          <PlusIcon className="size-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {formatPrice(item.product.price * item.quantity)}
                        </span>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="rounded p-1 text-ink-muted transition-colors hover:text-danger"
                          aria-label={`Remove ${item.product.name}`}
                        >
                          <Trash2Icon className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary */}
        {items.length > 0 && (
          <div className="space-y-2 border-t border-line p-5">
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Subtotal</span>
              <span className="font-medium">{formatPrice(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Delivery</span>
              <span className="font-medium">
                {hasFreeDelivery ? (
                  <span className="text-success">Free</span>
                ) : (
                  formatPrice(totals.deliveryFee)
                )}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Estimated tax</span>
              <span className="font-medium">{formatPrice(totals.tax)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <span>Total</span>
              <span>{formatPrice(totals.total)}</span>
            </div>
            <Link
              href="/checkout"
              onClick={close}
              className="btn btn-primary btn-lg mt-2 w-full"
            >
              Proceed to checkout <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}