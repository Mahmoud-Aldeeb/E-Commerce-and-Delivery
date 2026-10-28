"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  PackageXIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import PageHeader from "@/components/admin/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import { formatPrice } from "@/lib/format";
import { useMarkOutOfStock } from "@/lib/queries/admin";
import { categoriesOptions } from "@/lib/queries/categories";
import { productListOptions } from "@/lib/queries/products";
import type { Product } from "@/types";

const PAGE_SIZE = 10;
const LOW_STOCK = 5;

function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null) return <span className="badge badge-neutral">Not tracked</span>;
  if (stock <= 0) return <span className="badge badge-danger">Out of stock</span>;
  if (stock <= LOW_STOCK) return <span className="badge badge-warning">{stock} left</span>;
  return <span className="badge badge-success">{stock} in stock</span>;
}

export default function ProductsView() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<Product | null>(null);

  const markOutOfStock = useMarkOutOfStock();
  const { data: categories = [] } = useQuery(categoriesOptions());

  // Wait until the admin stops typing before asking the API
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...productListOptions({
      search: debouncedSearch || undefined,
      category: category || undefined,
      page,
      limit: PAGE_SIZE,
    }),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  const products = data?.products ?? [];
  const pages = data?.pages ?? 1;
  const hasFilters = Boolean(debouncedSearch || category);

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setCategory("");
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Products"
        description={data ? `${data.total} ${data.total === 1 ? "product" : "products"}` : undefined}
        action={
          <Link href="/admin/products/new" className="btn btn-primary">
            <PlusIcon className="size-4" /> Add product
          </Link>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
            aria-label="Search products"
            className="input pl-10"
          />
        </div>
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by category"
          className="input sm:w-56"
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the products"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : (
        <section className="card overflow-hidden">
          <div className={`overflow-x-auto transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-canvas text-xs uppercase text-ink-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Product</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Price</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Stock</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {isPending ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={4} className="px-5 py-4">
                        <div className="skeleton h-10 w-full" />
                      </td>
                    </tr>
                  ))
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-ink-muted">
                      No products found.{" "}
                      {hasFilters && (
                        <button onClick={clearFilters} className="font-medium text-primary-700 hover:underline">
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Image
                            src={product.image}
                            alt={product.name}
                            width={44}
                            height={44}
                            className="size-11 shrink-0 rounded-control bg-canvas object-cover"
                          />
                          <div className="min-w-0">
                            <p className="max-w-64 truncate font-medium">{product.name}</p>
                            <p className="text-xs text-ink-muted">
                              {product.category}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-medium">{formatPrice(product.price)}</span>
                        {product.discount > 0 && (
                          <span className="ml-2 text-xs text-ink-muted line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StockBadge stock={product.stock} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/admin/products/${product.id}/edit`}
                            className="btn btn-ghost p-2"
                            aria-label={`Edit ${product.name}`}
                          >
                            <PencilIcon className="size-4" />
                          </Link>
                          {(product.stock === null || product.stock > 0) && (
                            <button
                              onClick={() => setTarget(product)}
                              className="btn btn-ghost p-2 hover:text-danger"
                              aria-label={`Mark ${product.name} as out of stock`}
                            >
                              <PackageXIcon className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-muted">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(page - 1)} disabled={page <= 1} className="btn btn-secondary btn-sm">
                  Previous
                </button>
                <button onClick={() => setPage(page + 1)} disabled={page >= pages} className="btn btn-secondary btn-sm">
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {target && (
        <ConfirmDialog
          title="Mark as out of stock?"
          description={`"${target.name}" stays in the catalog but cannot be bought until you add stock again. To restock it, edit the product.`}
          confirmLabel="Mark out of stock"
          isPending={markOutOfStock.isPending}
          onConfirm={() => markOutOfStock.mutate(target.id, { onSuccess: () => setTarget(null) })}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  );
}