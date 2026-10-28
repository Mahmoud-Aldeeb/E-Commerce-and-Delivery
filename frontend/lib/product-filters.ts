import { formatPrice } from "@/lib/format";
import type { ProductFilters, SortOption } from "@/lib/queries/products";

export const SORT_OPTIONS: { value: SortOption | ""; label: string }[] = [
  { value: "", label: "Newest" },
  { value: "rating", label: "Top rated" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "name", label: "Name: A to Z" },
];

const SORT_VALUES: string[] = SORT_OPTIONS.map((option) => option.value);

type RawQuery = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function toPrice(value: string | undefined): number | undefined {
  if (!value || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

// Reads the URL and keeps only valid values: anything else is simply ignored,
// so a hand-edited or broken link never reaches the API
export function parseCatalogFilters(query: RawQuery): ProductFilters {
  const sort = first(query.sort);
  const page = Number.parseInt(first(query.page) ?? "", 10);
  const inStock = first(query.inStock);

  return {
    search: first(query.q)?.trim().slice(0, 100) || undefined,
    category: first(query.category)?.trim().slice(0, 60) || undefined,
    minPrice: toPrice(first(query.minPrice)),
    maxPrice: toPrice(first(query.maxPrice)),
    inStock: inStock === "1" || inStock === "true" ? true : undefined,
    sort: sort && SORT_VALUES.includes(sort) ? (sort as SortOption) : undefined,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
  };
}

// The opposite direction: filters to URL. Defaults are left out to keep links short
export function toSearchParams(filters: ProductFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.minPrice !== undefined)
    params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined)
    params.set("maxPrice", String(filters.maxPrice));
  if (filters.inStock) params.set("inStock", "1");
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page && filters.page > 1)
    params.set("page", String(filters.page));
  return params;
}

export function buildHref(basePath: string, filters: ProductFilters): string {
  const query = toSearchParams(filters).toString();
  return query ? `${basePath}?${query}` : basePath;
}

// Used as the React key of a Suspense boundary: a new key shows the loading skeleton
export const filtersKey = (filters: ProductFilters): string =>
  toSearchParams(filters).toString();

// Category, price and stock count as filters (sort and page do not)
export const hasActiveFilters = (filters: ProductFilters): boolean =>
  Boolean(
    filters.category ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.inStock,
  );

export function priceRangeLabel(min?: number, max?: number): string | null {
  if (min !== undefined && max !== undefined) {
    return `${formatPrice(min)} - ${formatPrice(max)}`;
  }
  if (min !== undefined) return `Over ${formatPrice(min)}`;
  if (max !== undefined) return `Under ${formatPrice(max)}`;
  return null;
}

// 1 ... 4 5 6 ... 20: always the first, the last and the neighbours of the current page
export function getPageItems(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = [1, total, current - 1, current, current + 1]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b)
    .filter((page, index, all) => index === 0 || page !== all[index - 1]);

  const items: (number | "ellipsis")[] = [];
  pages.forEach((page, index) => {
    if (index > 0) {
      const gap = page - pages[index - 1];
      if (gap === 2)
        items.push(page - 1); // one hidden page: show it instead of "..."
      else if (gap > 2) items.push("ellipsis");
    }
    items.push(page);
  });
  return items;
}
