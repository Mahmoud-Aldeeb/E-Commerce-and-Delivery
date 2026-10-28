import { queryOptions } from "@tanstack/react-query";
import api from "@/lib/api";
import type { StoreCategory } from "@/types";

// One place for the cache key: invalidating it refreshes every component that shows categories
export const categoryKeys = {
  all: ["categories"] as const,
};

export const categoriesOptions = () =>
  queryOptions({
    queryKey: categoryKeys.all,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ categories: StoreCategory[] }>(
        "/categories",
        { signal },
      );
      return data.categories;
    },
    staleTime: 60_000,
  });
