import { PackageIcon } from "lucide-react";
import ProductCard from "@/components/product/product-card";
import type { Product } from "@/types";

const DEFAULT_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5";

interface ProductListProps {
  products: Product[];
  className?: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  /** How many of the first cards load their image at once */
  eagerCount?: number;
}

// Server-rendered list: the cards are part of the page HTML
export default function ProductList({
  products,
  className = DEFAULT_GRID,
  emptyMessage = "No products found.",
  emptyAction,
  eagerCount = 0,
}: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
        <PackageIcon className="size-8 text-ink-muted" />
        <p className="text-ink-soft">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className={className}>
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} eager={index < eagerCount} />
      ))}
    </div>
  );
}