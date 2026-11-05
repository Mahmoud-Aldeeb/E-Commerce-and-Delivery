"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownRightIcon, ArrowUpRightIcon, TriangleAlertIcon } from "lucide-react";
import { CancelledPanel, LowStockPanel, RefundsPanel } from "@/components/admin/attention-panels";
import SalesChart from "@/components/admin/sales-chart";
import EmptyState from "@/components/ui/empty-state";
import { formatDayKey } from "@/lib/cash";
import { formatPrice } from "@/lib/format";
import { analyticsOptions, ANALYTICS_PERIODS, type AnalyticsPeriod } from "@/lib/queries/analytics";

function Change({ value, days }: { value: number | null; days: number }) {
  if (value === null) return <span className="text-xs text-ink-muted">Nothing before to compare with</span>;
  if (value === 0) return <span className="text-xs text-ink-muted">Same as the previous {days} days</span>;

  const up = value > 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
      <Icon className="size-3.5" />
      {up ? "+" : ""}
      {value}% <span className="font-normal text-ink-muted">vs the previous {days} days</span>
    </span>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function AnalyticsView() {
  const [days, setDays] = useState<AnalyticsPeriod>(30);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...analyticsOptions(days),
    // Keep the numbers of the other period on the screen while the new ones load
    placeholderData: keepPreviousData,
  });

  return (
    <section className="mt-8" aria-labelledby="analytics-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="analytics-heading" className="text-xl font-semibold tracking-tight">
            Sales and attention
          </h2>
          {data && (
            <p className="text-xs text-ink-muted">
              {formatDayKey(data.range.from)} to {formatDayKey(data.range.to)} · Cairo time · orders count on the
              day they were placed
            </p>
          )}
        </div>

        <div className="flex gap-2" role="group" aria-label="Period">
          {ANALYTICS_PERIODS.map((period) => (
            <button
              key={period.days}
              onClick={() => setDays(period.days)}
              aria-pressed={days === period.days}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${days === period.days
                ? "bg-primary-700 text-white"
                : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
                }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the analytics"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : isPending ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="skeleton h-28" />
            ))}
          </div>
          <div className="skeleton h-64 w-full" />
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
          {data.truncated && (
            <p role="status" className="rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">
              There are more orders than one report reads, so these numbers are partial. Choose a shorter period.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Revenue" value={formatPrice(data.summary.revenue)}>
              <Change value={data.change.revenue} days={data.range.days} />
            </Kpi>
            <Kpi label="Orders" value={String(data.summary.orders)}>
              <Change value={data.change.orders} days={data.range.days} />
            </Kpi>
            <Kpi label="Average order" value={formatPrice(data.summary.averageOrder)}>
              <span className="text-xs text-ink-muted">
                {data.summary.discount > 0
                  ? `${formatPrice(data.summary.discount)} in discounts`
                  : "No discounts given"}
              </span>
            </Kpi>
            <Kpi label="Cancelled orders" value={`${data.summary.cancelRate}%`}>
              <span className="text-xs text-ink-muted">
                {data.summary.cancelledOrders} {data.summary.cancelledOrders === 1 ? "order" : "orders"} cancelled
              </span>
            </Kpi>
          </div>

          <section className="card p-5">
            <h3 className="mb-4 font-semibold">Daily sales</h3>
            <SalesChart days={data.days} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <RefundsPanel refunds={data.refunds} />
            <LowStockPanel lowStock={data.lowStock} />
          </div>

          <section className="card overflow-hidden">
            <div className="border-b border-line px-5 py-4">
              <h3 className="font-semibold">Best sellers</h3>
            </div>
            {data.bestSellers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">No sales in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-sm">
                  <thead className="bg-canvas text-xs uppercase text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Product</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Units</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Revenue</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Orders</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">In stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.bestSellers.map((seller) => (
                      <tr key={seller.productId}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {seller.image ? (
                              <Image
                                src={seller.image}
                                alt=""
                                width={40}
                                height={40}
                                className="size-10 shrink-0 rounded-control bg-canvas object-cover"
                              />
                            ) : (
                              <span className="size-10 shrink-0 rounded-control bg-canvas" aria-hidden="true" />
                            )}
                            {seller.stock === null ? (
                              <span className="max-w-64 truncate font-medium">{seller.name}</span>
                            ) : (
                              <Link
                                href={`/admin/products/${seller.productId}/edit`}
                                className="max-w-64 truncate font-medium hover:text-primary-700"
                              >
                                {seller.name}
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold">{seller.units}</td>
                        <td className="px-5 py-3 text-right">{formatPrice(seller.revenue)}</td>
                        <td className="px-5 py-3 text-right text-ink-soft">{seller.orders}</td>
                        <td className="px-5 py-3 text-right">
                          {seller.stock === null ? (
                            <span className="text-ink-muted">-</span>
                          ) : seller.stock <= 10 ? (
                            <span className="badge badge-warning">{seller.stock}</span>
                          ) : (
                            seller.stock
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <CancelledPanel products={data.cancelledProducts} />
        </div>
      )}
    </section>
  );
}