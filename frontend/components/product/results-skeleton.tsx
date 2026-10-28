
import { CATALOG_GRID } from "@/components/product/product-grid";
import { PAGE_SIZE } from "@/lib/queries/products";
import ProductPageSkeleton from "./product-page-skeleton";

// The Suspense fallback of the catalog pages: it shows while a new filter is loading
export default function ResultsSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton mb-4 h-4 w-24" />
      <div className={CATALOG_GRID}>
        {Array.from({ length: PAGE_SIZE }, (_, index) => (
          <ProductPageSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
