"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORT_OPTIONS } from "@/lib/product-filters";

export default function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get("sort") ?? "";
  const current = SORT_OPTIONS.some((option) => option.value === raw) ? raw : "";

  function handleChange(value: string) {
    // Start from the current URL so every other filter (and the search term) is kept
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("sort", value);
    else params.delete("sort");
    params.delete("page"); // a new order starts again from the first page

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="hidden text-sm text-ink-muted sm:block">
        Sort by
      </label>
      <select
        id="sort"
        value={current}
        onChange={(event) => handleChange(event.target.value)}
        className="input w-auto py-2"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}