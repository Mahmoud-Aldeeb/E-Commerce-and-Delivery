"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildHref, hasActiveFilters, sameText } from "@/lib/product-filters";
import type { FilterOptions, ProductFilters } from "@/lib/queries/products";

interface FilterPanelProps {
  filters: ProductFilters;
  /** The names of the categories to choose from */
  categories: string[];
  /** The sizes and colours that the products of the open category have in stock */
  options: FilterOptions;
  /** Called after any change (the mobile sheet uses it to close itself) */
  onNavigate?: () => void;
}

const BASE_PATH = "/products";

const pill = "block rounded-control border px-3 py-1.5 text-sm font-medium transition-colors";
const pillState = (active: boolean) =>
  active
    ? "border-primary-700 bg-primary-50 text-primary-800"
    : "border-line-strong bg-surface text-ink hover:bg-canvas";

const toPrice = (value: string): number | undefined => {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) && number >= 0 ? number : undefined;
};

export default function FilterPanel({ filters, categories, options, onNavigate }: FilterPanelProps) {
  const router = useRouter();
  const [minPrice, setMinPrice] = useState(filters.minPrice?.toString() ?? "");
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice?.toString() ?? "");

  // Any filter change goes back to the first page
  const hrefWith = (changes: Partial<ProductFilters>) =>
    buildHref(BASE_PATH, { ...filters, ...changes, page: undefined });

  const go = (href: string) => {
    router.push(href);
    onNavigate?.();
  };

  const applyPrice = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let min = toPrice(minPrice);
    let max = toPrice(maxPrice);
    if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
    go(hrefWith({ minPrice: min, maxPrice: max }));
  };

  // A size or a colour that comes from the link stays on the list even when nothing has it in stock
  // any more: the customer sees that it is chosen, and can remove it
  const sizes =
    filters.size && !options.sizes.some((value) => sameText(value, filters.size))
      ? [...options.sizes, filters.size]
      : options.sizes;
  const colors =
    filters.color && !options.colors.some((color) => sameText(color.name, filters.color))
      ? [...options.colors, { name: filters.color }]
      : options.colors;

  // value "" = no category filter
  const items = [
    { value: "", label: "All categories" },
    ...categories.map((name) => ({ value: name, label: name })),
  ];

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold">Category</h3>
        <ul className="space-y-1">
          {items.map((item) => {
            const active = (filters.category ?? "") === item.value;
            return (
              <li key={item.value}>
                <Link
                  // The sizes and colours belong to a category: another category starts without them
                  href={hrefWith({ category: item.value || undefined, size: undefined, color: undefined })}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-control px-3 py-2 text-sm transition-colors ${active
                    ? "bg-primary-50 font-semibold text-primary-800"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {sizes.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Size</h3>
          <ul className="flex flex-wrap gap-2">
            {sizes.map((value) => {
              const active = sameText(filters.size, value);
              return (
                <li key={value}>
                  <Link
                    href={hrefWith({ size: active ? undefined : value })}
                    onClick={onNavigate}
                    aria-current={active ? "true" : undefined}
                    className={`${pill} ${pillState(active)}`}
                  >
                    {value}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {colors.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Colour</h3>
          <ul className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const active = sameText(filters.color, color.name);
              return (
                <li key={color.name}>
                  <Link
                    href={hrefWith({ color: active ? undefined : color.name })}
                    onClick={onNavigate}
                    aria-current={active ? "true" : undefined}
                    className={`${pill} ${pillState(active)}`}
                  >
                    {color.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold">Price</h3>
        <form onSubmit={applyPrice} className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Min"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              className="input"
              aria-label="Minimum price"
            />
            <span className="text-ink-muted">-</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="Max"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              className="input"
              aria-label="Maximum price"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm w-full">
            Apply
          </button>
        </form>
      </section>

      <section>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={Boolean(filters.inStock)}
            onChange={() => go(hrefWith({ inStock: filters.inStock ? undefined : true }))}
            className="size-4 accent-primary-700"
          />
          In stock only
        </label>
      </section>

      {hasActiveFilters(filters) && (
        <Link href={BASE_PATH} onClick={onNavigate} className="btn btn-ghost w-full text-danger hover:text-danger">
          Clear all filters
        </Link>
      )}
    </div>
  );
}