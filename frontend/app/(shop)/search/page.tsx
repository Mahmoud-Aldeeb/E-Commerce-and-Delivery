import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchIcon } from "lucide-react";
import CatalogResults from "@/components/product/catalog-results";
import LoadError from "@/components/product/load-error";
import ResultsSkeleton from "@/components/product/results-skeleton";
import SortSelect from "@/components/product/sort-select";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { filtersKey, parseCatalogFilters } from "@/lib/product-filters";
import type { ProductFilters } from "@/lib/queries/products";
import { getCatalog } from "@/lib/server/products";
import { safely } from "@/lib/server/safely";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Search result pages are not meant to be listed in search engines
export const metadata: Metadata = { title: "Search", robots: { index: false } };

function SearchPageSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton mb-5 h-4 w-32" />
      <div className="skeleton mb-4 h-8 w-64" />
      <ResultsSkeleton />
    </div>
  );
}

async function SearchResults({ filters }: { filters: ProductFilters }) {
  const data = await safely(() => getCatalog(filters));

  if (!data) return <LoadError message="We couldn't load the results." />;

  return (
    <CatalogResults
      data={data}
      filters={filters}
      basePath="/search"
      emptyMessage={`We couldn't find anything for "${filters.search}". Try a different word.`}
    />
  );
}

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseCatalogFilters(await searchParams);

  // No search term: say what to do instead of showing a loader that never ends
  if (!filters.search) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <SearchIcon className="mb-4 size-12 text-line-strong" />
        <h1 className="text-xl font-semibold">What are you looking for?</h1>
        <p className="mt-1 text-sm text-ink-soft">Type a product name in the search box.</p>
      </div>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Search results" }]} />

      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Results for &ldquo;{filters.search}&rdquo;
        </h1>
        {/* SortSelect reads the URL on the client, which has to be under Suspense too */}
        <Suspense fallback={<div className="skeleton h-10 w-32" />}>
          <SortSelect />
        </Suspense>
      </div>

      <Suspense key={filtersKey(filters)} fallback={<ResultsSkeleton />}>
        <SearchResults filters={filters} />
      </Suspense>
    </>
  );
}

export default function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="container-page py-6">
      <Suspense fallback={<SearchPageSkeleton />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}