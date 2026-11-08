import { CATALOG_GRID } from "@/components/product/product-grid";
import ProductCardSkeleton from "@/components/product/product-card-skeleton";
import { PAGE_SIZE } from "@/lib/queries/products";

// The Suspense fallback of the catalog pages: it shows while a new filter is loading
export default function ResultsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton mb-4 h-4 w-24" />
      <div className={CATALOG_GRID}>
        {Array.from({ length: PAGE_SIZE }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}