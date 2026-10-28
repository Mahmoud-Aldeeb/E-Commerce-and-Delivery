import { queryOptions } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Product } from "@/types";

export const PAGE_SIZE = 12;

export type SortOption = "price-low" | "price-high" | "rating" | "name";

// Filters understood by GET /products. `page` and `limit` drive the pagination
export type ProductFilters = {
  category?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: SortOption;
  page?: number;
  limit?: number;
};

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  pages: number;
}

// One place for all cache keys: invalidating ["products"] refreshes every product query
export const productKeys = {
  all: ["products"] as const,
  list: (filters: ProductFilters) =>
    [...productKeys.all, "list", filters] as const,
  detail: (id: string) => [...productKeys.all, "detail", id] as const,
  flashDeals: () => [...productKeys.all, "flash-deals"] as const,
};

// A list always has ONE shape (the whole response). Components that only need the
// products use `select`, so every filter combination keeps a single cache entry
export const productListOptions = (filters: ProductFilters = {}) =>
  queryOptions({
    queryKey: productKeys.list(filters),
    queryFn: async ({ signal }) => {
      // axios skips params that are undefined; `signal` lets TanStack cancel old requests
      const { data } = await api.get<ProductListResponse>("/products", {
        params: filters,
        signal,
      });
      return data;
    },
  });

// The catalog pages (products and search): the server prefetches this and the browser
// reads it, so both MUST build it with this function (same cache key)
export const catalogOptions = (filters: ProductFilters) =>
  productListOptions({ ...filters, limit: PAGE_SIZE });

export const popularProductsOptions = () =>
  productListOptions({ sort: "rating", limit: 10 });

// 6 = the 5 cards shown, plus one spare in case the current product is in the list
export const relatedProductsOptions = (category: string) =>
  productListOptions({ category, sort: "rating", limit: 6 });

export const productDetailOptions = (id: string) =>
  queryOptions({
    queryKey: productKeys.detail(id),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ product: Product }>(`/products/${id}`, {
        signal,
      });
      return data.product;
    },
  });

export const flashDealsOptions = () =>
  queryOptions({
    queryKey: productKeys.flashDeals(),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ products: Product[] }>(
        "/products/flash-deals",
        {
          signal,
        },
      );
      return data.products;
    },
  });
