import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import CatalogResults from "@/components/product/catalog-results";
import LoadError from "@/components/product/load-error";
import ProductsPageSkeleton from "@/components/product/products-page-skeleton";
import ProductsShell from "@/components/product/products-shell";
import ResultsSkeleton from "@/components/product/results-skeleton";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { filtersKey, parseCatalogFilters } from "@/lib/product-filters";
import type { ProductFilters } from "@/lib/queries/products";
import { getCatalog } from "@/lib/server/products";
import { getCategoryNames } from "@/lib/server/categories";
import { safely } from "@/lib/server/safely";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
  title: "Products",
  description: "Shop electronics, fashion, home essentials and more with fast delivery.",
};

async function ProductsResults({ filters }: { filters: ProductFilters }) {
  const data = await safely(() => getCatalog(filters));

  if (!data) return <LoadError message="We couldn't load the products." />;

  return (
    <CatalogResults
      data={data}
      filters={filters}
      basePath="/products"
      emptyAction={
        <Link href="/products" className="btn btn-secondary btn-sm">
          Clear filters
        </Link>
      }
    />
  );
}

// Reading the URL is request-time data, so everything that depends on it lives under Suspense
async function ProductsContent({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseCatalogFilters(await searchParams);
  const categories = (await safely(getCategoryNames)) ?? [];

  return (
    <>
      <Breadcrumbs
        items={
          filters.category
            ? [{ label: "Products", href: "/products" }, { label: filters.category }]
            : [{ label: "Products" }]
        }
      />

      <ProductsShell filters={filters} categories={categories}>
        {/* A new key = a new boundary: the skeleton shows at once while the next filter loads */}
        <Suspense key={filtersKey(filters)} fallback={<ResultsSkeleton />}>
          <ProductsResults filters={filters} />
        </Suspense>
      </ProductsShell>
    </>
  );
}
export default function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container-page py-6">
      <Suspense fallback={<ProductsPageSkeleton />}>
        <ProductsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}