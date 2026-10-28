
import Link from "next/link";
import { CATALOG_GRID } from "@/components/product/product-grid";
import Pagination from "@/components/ui/pagination";
import { buildHref } from "@/lib/product-filters";
import ProductList from "./product-list";
import type { ProductFilters, ProductListResponse } from "@/lib/queries/products";

interface CatalogResultsProps {
  data: ProductListResponse;
  filters: ProductFilters;
  /** Where the pagination links point: "/products" or "/search" */
  basePath: string;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
}

export default function CatalogResults({
  data,
  filters,
  basePath,
  emptyMessage = "No products match your filters.",
  emptyAction,
}: CatalogResultsProps) {



  // There are products, but the requested page is past the last one (an old or edited link)
  const pastLastPage = data.products.length === 0 && data.total > 0;

  return (
    <div>
      <p className="mb-4 text-sm text-ink-muted" aria-live="polite">
        {data ? `${data.total} ${data.total === 1 ? "product" : "products"}` : "\u00A0"}
      </p>

      {pastLastPage ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-ink-soft">There is nothing on this page.</p>
          <Link
            href={buildHref(basePath, { ...filters, page: undefined })}
            className="btn btn-secondary btn-sm transition-colors hover:bg-canvas"
          >
            Go to the first page
          </Link>
        </div>
      ) : (
        <ProductList
          products={data.products}
          className={CATALOG_GRID}
          emptyMessage={emptyMessage}
          emptyAction={emptyAction}
          eagerCount={4}
        />
      )}

      {data && (
        <Pagination basePath={basePath} filters={filters} page={data.page} pages={data.pages} />
      )}
    </div>
  );
}