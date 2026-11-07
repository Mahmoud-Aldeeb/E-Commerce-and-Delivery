"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MinusIcon, PlusIcon, ShoppingCartIcon, TruckIcon } from "lucide-react";
import RatingStars from "@/components/ui/rating-stars";
import { siteConfig } from "@/config/site";
import { useCart } from "@/context/cart-context";
import { keyOf, lineKey } from "@/lib/cart-line";
import { discountPercent, formatPrice } from "@/lib/format";
import { buildHref } from "@/lib/product-filters";
import { colorHexOf, colorsOf, findVariant, hasStockWith, sizesOf } from "@/lib/variant-options";
import type { Product } from "@/types";
import FavoriteButton from "./favorite-button";

// Used when there is no stock number to limit the quantity: no limit is known
const FALLBACK_MAX_QUANTITY = 99;
const LOW_STOCK_LIMIT = 5;

const pill = "rounded-control border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through";
const pillState = (active: boolean) =>
  active
    ? "border-primary-700 bg-primary-50 text-primary-800"
    : "border-line-strong bg-surface text-ink hover:bg-canvas";

export default function ProductDetails({ product }: { product: Product }) {
  const { items, addToCart, updateQuantity, removeFromCart, setIsCartOpen } = useCart();
  const [localQuantity, setLocalQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(product.image);
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");

  const images = [product.image, ...product.images];

  // ---------- Options (sizes and colours) ----------
  const variants = product.variants ?? [];
  const hasOptions = variants.length > 0;
  const sizes = sizesOf(variants);
  const colors = colorsOf(variants);

  // The option the customer has chosen completely: a size and/or a colour, whichever the product has
  const chosen =
    hasOptions && (sizes.length === 0 || size !== "") && (colors.length === 0 || color !== "")
      ? findVariant(variants, size, color)
      : null;
  const missing =
    !hasOptions || chosen
      ? null
      : sizes.length > 0 && size === ""
        ? "Choose a size"
        : colors.length > 0 && color === ""
          ? "Choose a colour"
          : "Choose options";

  function pick(nextSize: string, nextColor: string) {
    setSize(nextSize);
    setColor(nextColor);
    // The picture of the first option that fits what is chosen so far replaces the big one
    const withImage = variants.find(
      (variant) =>
        (nextSize === "" || variant.size === nextSize) &&
        (nextColor === "" || variant.color === nextColor) &&
        variant.image,
    );
    if (withImage?.image) setActiveImage(withImage.image);
  }

  function chooseSize(value: string) {
    // A colour that does not come in this size (or has none left) is dropped
    const keepColor = color !== "" && hasStockWith(variants, "color", color, value);
    pick(value, keepColor ? color : "");
  }

  function chooseColor(value: string) {
    const keepSize = size !== "" && hasStockWith(variants, "size", size, value);
    pick(keepSize ? size : "", value);
  }

  // ---------- Stock, quantity and the cart ----------
  // With options the stock is the one of the CHOSEN option; before choosing there is no number to show
  const stock = hasOptions ? (chosen ? chosen.stock : null) : product.stock;
  const outOfStock = hasOptions
    ? variants.every((variant) => variant.stock <= 0)
    : stock !== null && stock <= 0;
  const maxQuantity = stock ?? FALLBACK_MAX_QUANTITY;
  const lowStock = stock !== null && stock > 0 && stock <= LOW_STOCK_LIMIT;

  // Before adding, the stepper edits a local number. After adding, it edits the cart line
  const key = lineKey(product.id, chosen?.id);
  const cartItem = hasOptions && !chosen ? undefined : items.find((item) => keyOf(item) === key);
  const quantity = cartItem?.quantity ?? Math.min(localQuantity, Math.max(maxQuantity, 1));
  const atMax = quantity >= maxQuantity;

  const discount = discountPercent(product.price, product.originalPrice);
  const savings = discount > 0 ? (product.originalPrice ?? 0) - product.price : 0;
  const hasRating = (product.rating ?? 0) > 0 && (product.reviewCount ?? 0) > 0;

  const decrease = () => {
    if (cartItem) {
      if (cartItem.quantity > 1) updateQuantity(key, cartItem.quantity - 1);
      else removeFromCart(key);
    } else {
      setLocalQuantity((value) => Math.max(1, value - 1));
    }
  };

  const increase = () => {
    // The cart itself never goes above the stock
    if (cartItem) updateQuantity(key, cartItem.quantity + 1);
    else setLocalQuantity((value) => Math.min(maxQuantity, value + 1));
  };

  const addButton = outOfStock ? (
    <button disabled className="btn btn-primary btn-lg flex-1">
      Out of stock
    </button>
  ) : missing ? (
    <button disabled className="btn btn-primary btn-lg flex-1">
      {missing}
    </button>
  ) : cartItem ? (
    <button onClick={() => setIsCartOpen(true)} className="btn btn-secondary btn-lg flex-1">
      <ShoppingCartIcon className="size-4" />
      View cart
    </button>
  ) : (
    <button onClick={() => addToCart(product, quantity, chosen)} className="btn btn-primary btn-lg flex-1">
      <ShoppingCartIcon className="size-4" />
      Add to cart
    </button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      {/* Images */}
      <div>
        <div className="relative aspect-square overflow-hidden rounded-card border border-line bg-surface">
          <Image
            src={activeImage}
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

        {images.length > 1 && (
          <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label="Product images">
            {images.map((src, index) => (
              <li key={src}>
                <button
                  type="button"
                  onClick={() => setActiveImage(src)}
                  aria-label={`Show image ${index + 1}`}
                  aria-pressed={src === activeImage}
                  className={`relative block aspect-square w-full overflow-hidden rounded-control border bg-surface ${src === activeImage
                      ? "border-primary-700 ring-1 ring-primary-700"
                      : "border-line hover:border-line-strong"
                    }`}
                >
                  <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
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
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{product.name}</h1>
          <FavoriteButton productId={product.id} productName={product.name} className="-mr-2 shrink-0" />
        </div>
        {hasRating && (
          <a
            href="#reviews"
            className="mt-3 flex items-center gap-2 text-sm text-ink-soft hover:underline"
          >
            <RatingStars rating={product.rating ?? 0} />
            <span className="font-medium text-ink">{product.rating?.toFixed(1)}</span>
            <span>
              ({product.reviewCount} {product.reviewCount === 1 ? "review" : "reviews"})
            </span>
          </a>
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

        {/* Sizes and colours. A choice that has no stock with what is already chosen is disabled */}
        {sizes.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">
              Size{size && <span className="font-normal text-ink-soft">: {size}</span>}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseSize(value)}
                  disabled={!hasStockWith(variants, "size", value, color)}
                  aria-pressed={size === value}
                  className={`${pill} ${pillState(size === value)}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {colors.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">
              Colour{color && <span className="font-normal text-ink-soft">: {color}</span>}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((value) => {
                const hex = colorHexOf(variants, value);
                const available = hasStockWith(variants, "color", value, size);
                const active = color === value;

                return hex ? (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseColor(value)}
                    disabled={!available}
                    aria-pressed={active}
                    aria-label={value}
                    title={available ? value : `${value} (not available)`}
                    className={`size-9 rounded-full border-2 p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-primary-700" : "border-line"
                      }`}
                  >
                    <span
                      className="block size-full rounded-full border border-line"
                      style={{ backgroundColor: hex }}
                    />
                  </button>
                ) : (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseColor(value)}
                    disabled={!available}
                    aria-pressed={active}
                    className={`${pill} ${pillState(active)}`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

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