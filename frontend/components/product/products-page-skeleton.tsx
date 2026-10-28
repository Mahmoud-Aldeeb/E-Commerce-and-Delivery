import ResultsSkeleton from "@/components/product/results-skeleton";

// The static part of /products: what shows until the URL (the filters) is read
export default function ProductsPageSkeleton() {
  return (
    <div aria-busy="true">
      <div className="skeleton mb-5 h-4 w-40" />
      <div className="flex gap-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="card space-y-3 p-4">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="skeleton h-8 w-48" />
            <div className="skeleton h-10 w-32" />
          </div>
          <ResultsSkeleton />
        </div>
      </div>
    </div>
  );
}