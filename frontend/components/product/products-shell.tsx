"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import BottomSheet from "@/components/ui/bottom-sheet";
import FilterPanel from "@/components/product/filter-panel";
import SortSelect from "@/components/product/sort-select";
import { buildHref, priceRangeLabel } from "@/lib/product-filters";
import type { ProductFilters } from "@/lib/queries/products";

const BASE_PATH = "/products";

export default function ProductsShell({
  filters,
  categories,
  children,
}: {
  filters: ProductFilters;
  /** The names of the categories for the filter panel */
  categories: string[];
  /** The results: a Server Component streamed inside the Suspense of the page */
  children: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Each chip is a link to the same page WITHOUT that filter
  const without = (changes: Partial<ProductFilters>) =>
    buildHref(BASE_PATH, { ...filters, ...changes, page: undefined });

  const chips: { label: string; href: string }[] = [];
  if (filters.category) {
    chips.push({
      label: filters.category,
      href: without({ category: undefined }),
    });
  }
  const price = priceRangeLabel(filters.minPrice, filters.maxPrice);
  if (price) {
    chips.push({ label: price, href: without({ minPrice: undefined, maxPrice: undefined }) });
  }
  if (filters.inStock) {
    chips.push({ label: "In stock", href: without({ inStock: undefined }) });
  }

  // A new key rebuilds the panel, so its price fields follow the URL again
  const panelKey = `${filters.minPrice ?? ""}-${filters.maxPrice ?? ""}`;

  return (
    <div className="flex gap-8">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="card sticky top-32 p-4">
          <FilterPanel key={panelKey} filters={filters} categories={categories} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            {filters.category ?? "All products"}
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setSheetOpen(true)} className="btn btn-secondary lg:hidden">
              <SlidersHorizontalIcon className="size-4" />
              Filters
              {chips.length > 0 && <span className="badge badge-primary">{chips.length}</span>}
            </button>
            <Suspense fallback={<div className="skeleton h-10 w-32" />}>
              <SortSelect />
            </Suspense>
          </div>
        </div>

        {chips.length > 0 && (
          <ul className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.label}>
                <Link
                  href={chip.href}
                  className="badge badge-primary gap-1.5 py-1 transition-colors hover:bg-primary-100"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  {chip.label}
                  <XIcon className="size-3" />
                </Link>
              </li>
            ))}
            <li>
              <Link href={BASE_PATH} className="text-sm font-medium text-ink-soft hover:text-ink transition-colors">
                Clear all
              </Link>
            </li>
          </ul>
        )}

        {children}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filters">
        <FilterPanel
          key={panelKey}
          filters={filters}
          categories={categories}
          onNavigate={() => setSheetOpen(false)}
        />
      </BottomSheet>
    </div>
  );
}