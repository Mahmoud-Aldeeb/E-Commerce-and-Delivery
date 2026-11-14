"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlertIcon, Undo2Icon } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { adminReturnInsightsOptions } from "@/lib/queries/returns";

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-control bg-canvas p-4">
      <dt className="text-xs font-semibold uppercase text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tracking-tight">{value}</dd>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

// The returns indicators of the analytics page, for the same period as the rest of the page
export default function ReturnsInsights({ days }: { days: number }) {
  const { data, isPending, isError, refetch } = useQuery(adminReturnInsightsOptions(days));

  return (
    <section className="card p-5" aria-labelledby="returns-insights-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="returns-insights-title" className="flex items-center gap-2 text-base font-semibold">
          <Undo2Icon className="size-4 text-primary-700" /> Returns
        </h2>
        <Link href="/admin/returns" className="text-sm font-medium text-primary-700 hover:underline">
          Open returns
        </Link>
      </div>

      {isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          <TriangleAlertIcon className="size-4 text-danger" />
          We couldn&apos;t load the returns numbers.
          <button onClick={() => refetch()} className="btn btn-secondary btn-sm">
            Try again
          </button>
        </div>
      ) : isPending ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Return rate"
              value={`${data.summary.returnRate}%`}
              hint={`${data.summary.returnedUnits} of ${data.summary.deliveredUnits} delivered items came back`}
            />
            <Stat
              label="Return requests"
              value={String(data.summary.requests)}
              hint={`${data.summary.refused} refused · ${data.summary.cancelled} cancelled`}
            />
            <Stat
              label="Refunded"
              value={formatPrice(data.summary.refundedAmount)}
              hint={`${data.summary.refundedCount} completed ${data.summary.refundedCount === 1 ? "return" : "returns"}`}
            />
          </dl>

          <h3 className="mb-3 mt-6 text-sm font-semibold">Products that come back most</h3>
          {data.products.length === 0 ? (
            <p className="text-sm text-ink-muted">No item was returned in this period.</p>
          ) : (
            <ol className="space-y-3">
              {data.products.map((product) => (
                <li key={product.productId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{product.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">
                      {product.returned} returned
                      {product.rate === null ? " · no sale in this period" : ` of ${product.sold} sold · ${product.rate}%`}
                    </span>
                  </div>
                  {/* Decorative: the numbers above say the same */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-primary-600"
                      style={{ width: `${product.rate ?? 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-4 text-xs text-ink-muted">
            Return rate = items returned in this period ÷ items delivered in this period. Refused and cancelled
            requests do not count as items returned.
            {data.truncated && " This report reads only part of the period because there are too many orders."}
          </p>
        </>
      )}
    </section>
  );
}