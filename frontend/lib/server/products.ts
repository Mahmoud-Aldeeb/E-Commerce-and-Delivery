import { cacheLife, cacheTag } from "next/cache";
import api, { getErrorStatus } from "@/lib/api";
import {
  PAGE_SIZE,
  type ProductFilters,
  type ProductListResponse,
} from "@/lib/queries/products";
import type { Product } from "@/types";

// ---------- No arguments: stored with the prerendered page ----------

export async function getFlashDeals(): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  const { data } = await api.get<{ products: Product[] }>(
    "/products/flash-deals",
  );
  return data.products;
}

export async function getPopularProducts(): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("products");

  const { data } = await api.get<ProductListResponse>("/products", {
    params: { sort: "rating", limit: 10 },
  });
  return data.products;
}

// ---------- Arguments come from the URL: cached at request time, in the remote cache ----------

export async function getCatalog(
  filters: ProductFilters,
): Promise<ProductListResponse> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag("products");

  const { data } = await api.get<ProductListResponse>("/products", {
    // `search`, `limit` and `page` all have to reach the API, or the list and the paging break
    params: { ...filters, limit: PAGE_SIZE },
  });
  return data;
}

export async function getRelatedProducts(category: string): Promise<Product[]> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag("products");

  const { data } = await api.get<ProductListResponse>("/products", {
    params: { category, sort: "rating", limit: 6 },
  });
  return data.products;
}

// null = the API answered 404. Any other failure is thrown, and a thrown error is not cached
export async function getProduct(id: string): Promise<Product | null> {
  "use cache: remote";
  cacheLife("minutes");
  cacheTag("products", `product-${id}`);

  try {
    const { data } = await api.get<{ product: Product }>(`/products/${id}`);
    return data.product;
  } catch (error) {
    if (getErrorStatus(error) === 404) return null;
    throw error;
  }
}

// ---------- Sitemap: every product id, read page by page ----------

const API_MAX_LIMIT = 50; // the API rejects a bigger limit
const MAX_SITEMAP_PAGES = 1000; // 1000 x 50 = 50,000 = the most URLs one sitemap file may hold

export async function getSitemapProductIds(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  // A Set: if the API returns the same product on two pages, it is listed once
  const ids = new Set<string>();
  let page = 1;
  let pages = 1;

  do {
    const { data } = await api.get<ProductListResponse>("/products", {
      params: { limit: API_MAX_LIMIT, page },
    });
    for (const product of data.products) ids.add(product.id);
    pages = data.pages;
    page += 1;
  } while (page <= pages && page <= MAX_SITEMAP_PAGES);

  return [...ids];
}
