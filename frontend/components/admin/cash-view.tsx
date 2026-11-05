"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BanknoteIcon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import CashStats from "@/components/admin/cash-stats";
import PageHeader from "@/components/admin/page-header";
import EmptyState from "@/components/ui/empty-state";
import { formatStoreDateTime } from "@/lib/cash";
import { formatPrice } from "@/lib/format";
import { cashOverviewOptions } from "@/lib/queries/cash";

export default function CashView() {
  const { data, isPending, isError, refetch } = useQuery(cashOverviewOptions());

  return (
    <>
      <PageHeader
        title="Cash"
        description="A cash order is paid to the courier when it arrives. This is what each courier collected, handed over to the store, and still owes."
      />

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the cash"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : isPending ? (
        <div className="space-y-4" aria-busy="true">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-48 w-full" />
        </div>
      ) : (
        <>
          <CashStats balance={data.totals} owedLabel="Still with couriers" />

          {data.partners.length === 0 ? (
            <EmptyState
              icon={BanknoteIcon}
              title="No couriers yet"
              description="Add delivery partners first. Their cash appears here."
            />
          ) : (
            <section className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-left text-sm">
                  <thead className="bg-canvas text-xs uppercase text-ink-muted">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">Courier</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Cash orders</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Collected</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Handed over</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Owes</th>
                      <th scope="col" className="px-5 py-3 font-semibold">Last handover</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.partners.map((partner) => (
                      <tr key={partner.id}>
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/cash/${partner.id}`}
                            className="font-medium hover:text-primary-700"
                          >
                            {partner.name}
                          </Link>
                          <p className="text-xs capitalize text-ink-muted">
                            {partner.vehicleType ?? "Courier"} · {partner.phone}
                            {partner.isActive === false && (
                              <span className="badge badge-neutral ml-2">Inactive</span>
                            )}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-right">{partner.cashOrders}</td>
                        <td className="px-5 py-3 text-right">{formatPrice(partner.collected)}</td>
                        <td className="px-5 py-3 text-right">{formatPrice(partner.settled)}</td>
                        <td
                          className={`px-5 py-3 text-right font-semibold ${partner.owed > 0 ? "text-warning" : ""}`}
                        >
                          {formatPrice(partner.owed)}
                        </td>
                        <td className="px-5 py-3 text-ink-soft">
                          {partner.lastSettledAt ? formatStoreDateTime(partner.lastSettledAt) : "Never"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            href={`/admin/cash/${partner.id}`}
                            className="btn btn-ghost btn-sm"
                            aria-label={`Open the cash of ${partner.name}`}
                          >
                            Open <ChevronRightIcon className="size-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="mt-3 text-xs text-ink-muted">
            The biggest debt comes first. Orders paid by card are not here: that money goes to the store through Stripe.
          </p>
        </>
      )}
    </>
  );
}