"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingCartIcon, StarIcon } from "lucide-react";
import { useCart } from "@/context/cart-context";
import { discountPercent, formatPrice } from "@/lib/format";
import type { Product } from "@/types";


const LOW_STOCK_LIMIT = 5;

interface ProductCardProps {
  product: Product;
  /** Load the image at once. Only for cards that are visible without scrolling */
  eager?: boolean;
}


export default function ProductCard({ product, eager = false }: ProductCardProps) {
  const { items, addToCart } = useCart();

  const inCart = items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const stock = product.stock;
  const outOfStock = stock !== null && stock <= 0;
  // The cart never holds more than the available stock
  const atLimit = stock !== null && inCart >= stock;
  const lowStock = stock !== null && stock > 0 && stock <= LOW_STOCK_LIMIT;
  const discount = discountPercent(product.price, product.originalPrice);
  const hasRating = (product.rating ?? 0) > 0;

  return (
    <article className="card group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
      {/* The image link is skipped by keyboard users: the title link below goes to the same page */}
      <Link
        href={`/products/${product.id}`}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-square bg-canvas"
      >
        <Image
          src={product.image}
          alt={product.name}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {discount > 0 && !outOfStock && (
          <span className="badge badge-danger absolute left-3 top-3">-{discount}%</span>
        )}
        {outOfStock && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/70">
            <span className="badge badge-neutral">Out of stock</span>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={`/products/${product.id}`}
          className="line-clamp-2 min-h-10 text-sm font-medium transition-colors hover:text-primary-700"
        >
          {product.name}
        </Link>

        {hasRating && (
          <div className="flex items-center gap-1 text-xs text-ink-soft">
            <StarIcon className="size-3.5 fill-amber-400 text-amber-400" />
            <span className="font-medium">{product.rating?.toFixed(1)}</span>
            {(product.reviewCount ?? 0) > 0 && (
              <span className="text-ink-muted">({product.reviewCount})</span>
            )}
          </div>
        )}

        {lowStock && (
          <p className="text-xs font-medium text-warning">Only {stock} left</p>
        )}

        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-lg font-bold">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <span className="text-sm text-ink-muted line-through">
              {formatPrice(product.originalPrice)}
            </span>
          )}
        </div>

        <button
          onClick={() => addToCart(product)}
          disabled={outOfStock || atLimit}
          className="btn btn-primary w-full"
          aria-label={`Add ${product.name} to cart`}
        >
          <ShoppingCartIcon className="size-4" />
          {outOfStock ? "Out of stock" : atLimit ? "Max in cart" : "Add to cart"}
        </button>
      </div>
    </article>
  );
}