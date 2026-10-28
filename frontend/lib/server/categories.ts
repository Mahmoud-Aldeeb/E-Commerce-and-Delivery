import { cacheLife, cacheTag } from "next/cache";
import api from "@/lib/api";
import type { StoreCategory } from "@/types";

// The names of the categories that have products, in display order (the API sorts them).
// Only the names reach the pages: it is all the header, the home page and the filters need.
// A category without products is left out: it would lead to an empty page
export async function getCategoryNames(): Promise<string[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("categories");

  const { data } = await api.get<{ categories: StoreCategory[] }>(
    "/categories",
  );
  return data.categories
    .filter((category) => category.productCount > 0)
    .map((category) => category.name);
}
