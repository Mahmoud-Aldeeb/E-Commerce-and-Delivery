"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HeartIcon, TriangleAlertIcon } from "lucide-react";
import ProductList from "@/components/product/product-list";
import EmptyState from "@/components/ui/empty-state";
import { favoritesOptions } from "@/lib/queries/favorites";

export default function FavoritesView() {
  const { data, isPending, isError, refetch } = useQuery(favoritesOptions());

  return (
    <div className="container-page py-8">
      <h1 className="text-2xl font-bold tracking-tight">My favorites</h1>
      {data && data.length > 0 && (
        <p className="mt-1 text-sm text-ink-muted">
          {data.length} {data.length === 1 ? "product" : "products"}
        </p>
      )}

      <div className="mt-6">
        {isPending ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="skeleton aspect-[3/4] w-full" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={TriangleAlertIcon}
            title="We couldn't load your favorites"
            action={
              <button onClick={() => refetch()} className="btn btn-secondary">
                Try again
              </button>
            }
          />
        ) : data.length === 0 ? (
          <EmptyState
            icon={HeartIcon}
            title="No favorites yet"
            description="Tap the heart on a product to save it here."
            action={
              <Link href="/products" className="btn btn-primary">
                Browse products
              </Link>
            }
          />
        ) : (
          <ProductList products={data} />
        )}
      </div>
    </div>
  );
}