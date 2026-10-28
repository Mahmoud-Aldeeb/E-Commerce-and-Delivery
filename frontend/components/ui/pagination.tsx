import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buildHref, getPageItems } from "@/lib/product-filters";
import type { ProductFilters } from "@/lib/queries/products";

interface PaginationProps {
  basePath: string;
  filters: ProductFilters;
  page: number;
  pages: number;
}

const cell =
  "flex size-9 items-center justify-center rounded-control text-sm font-medium transition-colors";

export default function Pagination({ basePath, filters, page, pages }: PaginationProps) {
  if (pages <= 1) return null;

  const hrefFor = (target: number) => buildHref(basePath, { ...filters, page: target });

  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" aria-label="Previous page" className={`${cell} hover:bg-canvas`}>
          <ChevronLeftIcon className="size-4" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${cell} text-line-strong`}>
          <ChevronLeftIcon className="size-4" />
        </span>
      )}

      {getPageItems(page, pages).map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="px-1 text-ink-muted">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            className={`${cell} ${item === page ? "bg-primary-700 text-white" : "text-ink-soft hover:bg-canvas"}`}
          >
            {item}
          </Link>
        ),
      )}

      {page < pages ? (
        <Link href={hrefFor(page + 1)} rel="next" aria-label="Next page" className={`${cell} hover:bg-canvas`}>
          <ChevronRightIcon className="size-4" />
        </Link>
      ) : (
        <span aria-hidden="true" className={`${cell} text-line-strong`}>
          <ChevronRightIcon className="size-4" />
        </span>
      )}
    </nav>
  );
}