"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MinusIcon, PlusIcon, ShoppingCartIcon, TruckIcon } from "lucide-react";
import RatingStars from "@/components/ui/rating-stars";
import { siteConfig } from "@/config/site";
import { useCart } from "@/context/cart-context";
import { discountPercent, formatPrice } from "@/lib/format";
import { buildHref } from "@/lib/product-filters";
import type { Product } from "@/types";

// Used when a product has no stock number (null): no limit is known
const FALLBACK_MAX_QUANTITY = 99;
const LOW_STOCK_LIMIT = 5;

export default function ProductDetails({ product }: { product: Product }) {
  const { items, addToCart, updateQuantity, removeFromCart, setIsCartOpen } = useCart();
  const [localQuantity, setLocalQuantity] = useState(1);

  const stock = product.stock;
  const outOfStock = stock !== null && stock <= 0;
  const maxQuantity = stock ?? FALLBACK_MAX_QUANTITY;
  const lowStock = stock !== null && stock > 0 && stock <= LOW_STOCK_LIMIT;

  // Before adding, the stepper edits a local number. After adding, it edits the cart line.
  const cartItem = items.find((item) => item.product.id === product.id);
  const quantity = cartItem?.quantity ?? Math.min(localQuantity, Math.max(maxQuantity, 1));
  const atMax = quantity >= maxQuantity;

  const discount = discountPercent(product.price, product.originalPrice);
  const savings = discount > 0 ? (product.originalPrice ?? 0) - product.price : 0;
  const hasRating = (product.rating ?? 0) > 0 && (product.reviewCount ?? 0) > 0;

  const decrease = () => {
    if (cartItem) {
      if (cartItem.quantity > 1) updateQuantity(product.id, cartItem.quantity - 1);
      else removeFromCart(product.id);
    } else {
      setLocalQuantity((value) => Math.max(1, value - 1));
    }
  };

  const increase = () => {
    // The cart itself never goes above the stock
    if (cartItem) updateQuantity(product.id, cartItem.quantity + 1);
    else setLocalQuantity((value) => Math.min(maxQuantity, value + 1));
  };

  const addButton = outOfStock ? (
    <button disabled className="btn btn-primary btn-lg flex-1">
      Out of stock
    </button>
  ) : cartItem ? (
    <button onClick={() => setIsCartOpen(true)} className="btn btn-secondary btn-lg flex-1">
      <ShoppingCartIcon className="size-4" />
      View cart
    </button>
  ) : (
    <button onClick={() => addToCart(product, localQuantity)} className="btn btn-primary btn-lg flex-1">
      <ShoppingCartIcon className="size-4" />
      Add to cart
    </button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden rounded-card border border-line bg-surface">
        <Image
          src={product.image}
          alt={product.name}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-contain p-6"
        />
        {discount > 0 && !outOfStock && (
          <span className="badge badge-danger absolute left-4 top-4 text-sm">-{discount}%</span>
        )}
      </div>

      {/* Details and buy box: it stays in view while the page scrolls on large screens */}
      <div className="lg:sticky lg:top-32 lg:self-start">
        <Link
          href={buildHref("/products", { category: product.category })}
          className="text-sm font-medium text-primary-700 transition-colors hover:text-primary-800 hover:underline"
        >
          {product.category}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{product.name}</h1>

        {hasRating && (
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
            <RatingStars rating={product.rating ?? 0} />
            <span className="font-medium text-ink">{product.rating?.toFixed(1)}</span>
            <span>({product.reviewCount} ratings)</span>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-baseline gap-3">
          <span className="text-3xl font-bold text-ink">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <>
              <span className="text-lg text-ink-muted line-through">
                {formatPrice(product.originalPrice)}
              </span>
              <span className="text-sm font-medium text-danger">Save {formatPrice(savings)}</span>
            </>
          )}
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {product.description || "No description available."}
        </p>

        <div className="mt-5">
          {outOfStock ? (
            <span className="badge badge-neutral">Out of stock</span>
          ) : lowStock ? (
            <span className="badge badge-warning">Only {stock} left</span>
          ) : (
            <span className="badge badge-success">In stock</span>
          )}
        </div>

        {/* Quantity and add to cart */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center rounded-control border border-line-strong bg-surface">
            <button
              onClick={decrease}
              disabled={outOfStock}
              className="p-3 text-ink transition-colors hover:bg-canvas disabled:opacity-50"
              aria-label="Decrease quantity"
            >
              <MinusIcon className="size-4" />
            </button>
            <span className="min-w-10 text-center text-sm font-semibold text-ink" aria-live="polite">
              {quantity}
            </span>
            <button
              onClick={increase}
              disabled={outOfStock || atMax}
              className="p-3 text-ink transition-colors hover:bg-canvas disabled:opacity-50"
              aria-label="Increase quantity"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
          {addButton}
        </div>
        {cartItem && <p className="mt-2 text-sm text-ink-muted">This item is in your cart.</p>}

        <ul className="mt-6 space-y-2 rounded-card border border-line bg-canvas p-4 text-sm text-ink-soft">
          <li className="flex items-center gap-2">
            <TruckIcon className="size-4 text-primary-700" />
            Free delivery on orders over ${siteConfig.freeDeliveryThreshold}
          </li>
          <li className="flex items-center gap-2">
            <TruckIcon className="size-4 text-primary-700" />
            Track your order live on the map
          </li>
        </ul>
      </div>

      {/* Small screens: the price and the button stay at the bottom of the screen */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-surface p-3 shadow-pop lg:hidden">
        <div className="shrink-0">
          <p className="text-lg font-bold leading-tight text-ink">{formatPrice(product.price)}</p>
          {discount > 0 && (
            <p className="text-xs text-ink-muted line-through">{formatPrice(product.originalPrice)}</p>
          )}
        </div>
        {addButton}
      </div>
    </div>
  );
}