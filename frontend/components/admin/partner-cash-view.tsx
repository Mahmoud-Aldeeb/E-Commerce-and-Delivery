"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, BanknoteIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import CashStats from "@/components/admin/cash-stats";
import PageHeader from "@/components/admin/page-header";
import SettlementDialog from "@/components/admin/settlement-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import { getErrorStatus } from "@/lib/api";
import {
  checkRange,
  formatDayKey,
  formatStoreDateTime,
  formatWeek,
  presetRange,
  type RangePreset,
} from "@/lib/cash";
import { formatPrice } from "@/lib/format";
import { partnerLedgerOptions, useVoidSettlement, type LedgerSettlement } from "@/lib/queries/cash";

type Tab = "days" | "weeks" | "orders" | "handovers";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "last7", label: "Last 7 days" },
  { key: "week", label: "This week" },
  { key: "last30", label: "Last 30 days" },
];

function Table({
  columns,
  children,
}: {
  columns: { label: string; right?: boolean }[];
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="bg-canvas text-xs uppercase text-ink-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className={`px-5 py-3 font-semibold ${column.right ? "text-right" : ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function PartnerCashView({ partnerId }: { partnerId: string }) {
  // The period that is on the screen. Empty = the default of the API (the last 7 days)
  const [applied, setApplied] = useState({ from: "", to: "" });
  // The dates being typed. null = nothing is being edited: the inputs show the period on the screen
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const [tab, setTab] = useState<Tab>("days");
  const [recording, setRecording] = useState(false);
  const [voidTarget, setVoidTarget] = useState<LedgerSettlement | null>(null);

  const voidSettlement = useVoidSettlement();
  const { data, isPending, isError, error, isPlaceholderData, refetch } = useQuery({
    ...partnerLedgerOptions(partnerId, applied.from, applied.to),
    // Keep the numbers on the screen while a new period loads
    placeholderData: keepPreviousData,
  });

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    const notFound = getErrorStatus(error) === 404;
    return (
      <EmptyState
        icon={notFound ? BanknoteIcon : TriangleAlertIcon}
        title={notFound ? "Courier not found" : "We couldn't load the cash of this courier"}
        action={
          notFound ? (
            <Link href="/admin/cash" className="btn btn-primary">
              Back to cash
            </Link>
          ) : (
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          )
        }
      />
    );
  }

  const { partner, balance, range, totals } = data;
  const shown = draft ?? { from: range.from, to: range.to };
  const rangeError = draft ? checkRange(draft.from, draft.to) : null;
  const canApply = draft !== null && rangeError === null;

  const applyDraft = () => {
    if (!draft || rangeError) return;
    setApplied(draft);
    setDraft(null);
  };
  const applyPreset = (preset: RangePreset) => {
    setApplied(presetRange(preset));
    setDraft(null);
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "days", label: "By day", count: data.days.length },
    { key: "weeks", label: "By week", count: data.weeks.length },
    { key: "orders", label: "Orders", count: totals.orders },
    { key: "handovers", label: "Handovers", count: data.settlements.length },
  ];

  return (
    <>
      <Link
        href="/admin/cash"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> All couriers
      </Link>

      <PageHeader
        title={partner.name}
        description={`${partner.phone}${partner.isActive === false ? " · Inactive" : ""}`}
        action={
          <button
            onClick={() => setRecording(true)}
            disabled={balance.owed <= 0}
            title={balance.owed <= 0 ? "This courier owes nothing right now" : undefined}
            className="btn btn-primary"
          >
            <PlusIcon className="size-4" /> Record handover
          </button>
        }
      />

      <CashStats balance={balance} owedLabel="Still owed" />
      <p className="-mt-3 mb-6 text-xs text-ink-muted">
        These three numbers count everything since the first delivery. The period below only filters the lists.
      </p>

      {/* The period */}
      <section className="card mb-5 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="cash-from" className="field-label">
              From
            </label>
            <input
              id="cash-from"
              type="date"
              className="input"
              value={shown.from}
              onChange={(event) => setDraft({ ...shown, from: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="cash-to" className="field-label">
              To
            </label>
            <input
              id="cash-to"
              type="date"
              className="input"
              value={shown.to}
              onChange={(event) => setDraft({ ...shown, to: event.target.value })}
            />
          </div>
          <button onClick={applyDraft} disabled={!canApply} className="btn btn-primary btn-sm">
            Apply
          </button>

          <div className="flex flex-wrap gap-2 sm:ml-auto" role="group" aria-label="Quick periods">
            {PRESETS.map((preset) => {
              const dates = presetRange(preset.key);
              const active = shown.from === dates.from && shown.to === dates.to;
              return (
                <button
                  key={preset.key}
                  onClick={() => applyPreset(preset.key)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active
                    ? "bg-primary-700 text-white"
                    : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
                    }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {rangeError && (
          <p role="alert" className="field-error">
            {rangeError}
          </p>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          Both days are included. Days, weeks (Saturday to Friday) and times are Cairo time.
        </p>
      </section>

      <p className="mb-4 text-sm text-ink-soft">
        In this period: <strong>{totals.orders}</strong> cash {totals.orders === 1 ? "order" : "orders"},{" "}
        <strong>{formatPrice(totals.collected)}</strong> collected,{" "}
        <strong>{formatPrice(totals.settled)}</strong> handed over.
      </p>

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Lists">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            aria-pressed={tab === item.key}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === item.key
              ? "bg-primary-700 text-white"
              : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
              }`}
          >
            {item.label}
            <span className="ml-1.5 opacity-70">{item.count}</span>
          </button>
        ))}
      </div>

      <div className={`transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
        {tab === "days" &&
          (data.days.length === 0 ? (
            <EmptyState icon={BanknoteIcon} title="No cash in this period" />
          ) : (
            <Table
              columns={[
                { label: "Day" },
                { label: "Orders", right: true },
                { label: "Collected", right: true },
                { label: "Handed over", right: true },
              ]}
            >
              {data.days.map((day) => (
                <tr key={day.date}>
                  <td className="px-5 py-3 font-medium">{formatDayKey(day.date)}</td>
                  <td className="px-5 py-3 text-right">{day.orders}</td>
                  <td className="px-5 py-3 text-right">{formatPrice(day.collected)}</td>
                  <td className="px-5 py-3 text-right">{formatPrice(day.settled)}</td>
                </tr>
              ))}
            </Table>
          ))}

        {tab === "weeks" &&
          (data.weeks.length === 0 ? (
            <EmptyState icon={BanknoteIcon} title="No cash in this period" />
          ) : (
            <Table
              columns={[
                { label: "Week (Saturday to Friday)" },
                { label: "Orders", right: true },
                { label: "Collected", right: true },
                { label: "Handed over", right: true },
              ]}
            >
              {data.weeks.map((week) => (
                <tr key={week.weekStart}>
                  <td className="px-5 py-3 font-medium">{formatWeek(week.weekStart, week.weekEnd)}</td>
                  <td className="px-5 py-3 text-right">{week.orders}</td>
                  <td className="px-5 py-3 text-right">{formatPrice(week.collected)}</td>
                  <td className="px-5 py-3 text-right">{formatPrice(week.settled)}</td>
                </tr>
              ))}
            </Table>
          ))}

        {tab === "orders" &&
          (data.orders.length === 0 ? (
            <EmptyState icon={BanknoteIcon} title="No cash orders in this period" />
          ) : (
            <>
              <Table
                columns={[
                  { label: "Order" },
                  { label: "Customer" },
                  { label: "Delivered" },
                  { label: "Collected", right: true },
                ]}
              >
                {data.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-5 py-3 font-mono font-medium">{order.number}</td>
                    <td className="px-5 py-3 text-ink-soft">{order.customer}</td>
                    <td className="px-5 py-3 text-ink-soft">{formatStoreDateTime(order.deliveredAt)}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatPrice(order.total)}</td>
                  </tr>
                ))}
              </Table>
              {data.ordersTruncated && (
                <p className="mt-2 text-xs text-ink-muted">
                  Only the newest {data.orders.length} orders are listed. The totals count all of them.
                </p>
              )}
            </>
          ))}

        {tab === "handovers" &&
          (data.settlements.length === 0 ? (
            <EmptyState
              icon={BanknoteIcon}
              title="No handovers in this period"
              description="Record one when the courier hands cash over to the store."
            />
          ) : (
            <Table
              columns={[
                { label: "Amount", right: true },
                { label: "When" },
                { label: "Note" },
                { label: "Recorded by" },
                { label: "Status" },
                { label: "Actions", right: true },
              ]}
            >
              {data.settlements.map((settlement) => {
                const cancelled = settlement.voidedAt !== null;
                return (
                  <tr key={settlement.id} className={cancelled ? "text-ink-muted" : ""}>
                    <td className={`px-5 py-3 text-right font-semibold ${cancelled ? "line-through" : ""}`}>
                      {formatPrice(settlement.amount)}
                    </td>
                    <td className="px-5 py-3">{formatStoreDateTime(settlement.settledAt)}</td>
                    <td className="max-w-56 truncate px-5 py-3">{settlement.note ?? "-"}</td>
                    <td className="px-5 py-3">{settlement.recordedBy ?? "-"}</td>
                    <td className="px-5 py-3">
                      {cancelled ? (
                        <span
                          className="badge badge-neutral"
                          title={`Cancelled ${formatStoreDateTime(settlement.voidedAt as string)}`}
                        >
                          Cancelled
                        </span>
                      ) : (
                        <span className="badge badge-success">Counted</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!cancelled && (
                        <button
                          onClick={() => setVoidTarget(settlement)}
                          className="btn btn-ghost btn-sm hover:text-danger"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          ))}
      </div>

      {recording && (
        <SettlementDialog
          partnerId={partner.id}
          partnerName={partner.name}
          owed={balance.owed}
          onClose={() => setRecording(false)}
        />
      )}

      {voidTarget && (
        <ConfirmDialog
          title="Cancel this handover?"
          description={`${formatPrice(voidTarget.amount)} goes back to what ${partner.name} owes. The entry stays in the history, marked as cancelled. Use this to fix a mistake.`}
          confirmLabel="Cancel handover"
          isPending={voidSettlement.isPending}
          onConfirm={() => voidSettlement.mutate(voidTarget.id, { onSettled: () => setVoidTarget(null) })}
          onCancel={() => setVoidTarget(null)}
        />
      )}
    </>
  );
}