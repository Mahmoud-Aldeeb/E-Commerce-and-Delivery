"use client";

import { useQuery } from "@tanstack/react-query";
import { BanknoteIcon } from "lucide-react";
import { formatDayKey, formatStoreDateTime } from "@/lib/cash";
import { formatPrice } from "@/lib/format";
import { myCashOptions } from "@/lib/queries/cash";

const deliveries = (count: number) => `${count} cash ${count === 1 ? "delivery" : "deliveries"}`;

// What the courier holds that belongs to the store: read only. The store records what he hands over
export default function CashCard() {
  const { data, isPending, isError, refetch } = useQuery(myCashOptions());

  if (isPending) return <div className="skeleton mb-5 h-28 w-full" aria-busy="true" />;

  if (isError) {
    return (
      <section className="card mb-5 flex items-center justify-between gap-3 p-4">
        <p className="text-sm text-ink-soft">We could not load your cash.</p>
        <button onClick={() => refetch()} className="btn btn-secondary btn-sm">
          Try again
        </button>
      </section>
    );
  }

  const { balance, today, week, settlements } = data;
  const nothingOwed = balance.owed <= 0;

  return (
    <section className="card mb-5 p-4">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${nothingOwed ? "bg-canvas text-ink-muted" : "bg-warning-soft text-warning"
            }`}
        >
          <BanknoteIcon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase text-ink-muted">Cash to hand over</p>
          <p className="text-2xl font-bold">{formatPrice(balance.owed)}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {nothingOwed
          ? "You have nothing to hand over to the store."
          : "The cash you collected from customers, minus what the store recorded as received from you."}
      </p>

      <details className="mt-3 border-t border-line pt-3 text-sm">
        <summary className="cursor-pointer font-medium text-primary-700">
          Today, this week and your handovers
        </summary>

        <dl className="mt-3 space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Today ({deliveries(today.orders)})</dt>
            <dd className="font-medium">{formatPrice(today.collected)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">
              Since {formatDayKey(week.weekStart)} ({deliveries(week.orders)})
            </dt>
            <dd className="font-medium">{formatPrice(week.collected)}</dd>
          </div>
        </dl>

        <h3 className="mt-4 text-xs font-semibold uppercase text-ink-muted">Last handovers</h3>
        {settlements.length === 0 ? (
          <p className="mt-1 text-ink-muted">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {settlements.map((settlement) => (
              <li key={settlement.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-ink-soft">{formatStoreDateTime(settlement.settledAt)}</p>
                  {settlement.note && <p className="truncate text-xs text-ink-muted">{settlement.note}</p>}
                </div>
                <span className="shrink-0 font-medium">{formatPrice(settlement.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-ink-muted">Days and times are Cairo time.</p>
      </details>
    </section>
  );
}