"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SearchIcon, TriangleAlertIcon, Undo2Icon } from "lucide-react";
import Field from "@/components/admin/field";
import PageHeader from "@/components/admin/page-header";
import ReturnItems from "@/components/returns/return-items";
import ReturnStatusBadge from "@/components/returns/return-status-badge";
import EmptyState from "@/components/ui/empty-state";
import Modal from "@/components/ui/modal";
import Pager from "@/components/ui/pager";
import { formatDateTime, formatPrice } from "@/lib/format";
import { orderNumber, paymentLabel } from "@/lib/orders";
import {
  adminReturnsOptions,
  useApproveReturn,
  useCompleteReturn,
  useRejectReturn,
  useRetryReturnRefund,
  type AdminReturn,
  type AdminReturnTab,
} from "@/lib/queries/returns";
import { reasonLabel, returnNumber } from "@/lib/returns";

const TABS: { key: AdminReturnTab; label: string }[] = [
  { key: "requested", label: "New" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Refused or cancelled" },
  { key: "refund-failed", label: "Refund needed" },
  { key: "all", label: "All" },
];

const EMPTY: Record<AdminReturnTab, string> = {
  all: "No returns yet. They appear here when customers return items of a delivered order.",
  requested: "No new requests.",
  approved: "No approved return is waiting for its items.",
  completed: "No completed returns.",
  declined: "Nothing was refused or cancelled.",
  "refund-failed": "Every refund went through.",
};

// Approve or refuse: a note for the customer. Refusing needs one: the customer reads why
function DecisionDialog({
  kind,
  item,
  onClose,
}: {
  kind: "approve" | "reject";
  item: AdminReturn;
  onClose: () => void;
}) {
  const approve = useApproveReturn();
  const reject = useRejectReturn();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  const isReject = kind === "reject";
  const pending = approve.isPending || reject.isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = note.trim();
    if (isReject && !text) {
      setError("Say why the return is refused: the customer reads it.");
      return;
    }

    const done = { onSuccess: onClose };
    if (isReject) reject.mutate({ id: item.id, note: text }, done);
    else approve.mutate({ id: item.id, note: text || undefined }, done);
  }

  return (
    <Modal title={isReject ? "Refuse this return?" : "Approve this return?"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-ink-soft">
          {returnNumber(item.id)} · {item.user.name}
          {isReject
            ? ". The customer sees your reason and can ask again for other items."
            : ". The customer is told to send the items back. The refund comes when you complete the return."}
        </p>

        <Field
          id="decision-note"
          label={isReject ? "Why is it refused?" : "Note for the customer"}
          error={error}
          hint={isReject ? undefined : "Optional. For example how to send the items back."}
        >
          <textarea
            id="decision-note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setError(undefined);
            }}
            className={`input resize-none ${error ? "input-error" : ""}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "decision-note-error" : undefined}
            autoFocus
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={pending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className={`btn ${isReject ? "btn-danger" : "btn-primary"}`}>
            {pending ? "Working..." : isReject ? "Refuse return" : "Approve return"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// The items arrived: they go back on the shelves (or not), and the customer gets the money back
function CompleteDialog({ item, onClose }: { item: AdminReturn; onClose: () => void }) {
  const complete = useCompleteReturn();
  const isCard = item.order.paymentMethod === "card";
  const amount = formatPrice(item.refundAmount);

  // A defective item cannot be sold again: it only goes back on the shelves when the admin says so
  const [restock, setRestock] = useState(item.reason !== "DEFECTIVE");
  const [cashRefunded, setCashRefunded] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isCard && !cashRefunded) {
      setError("Confirm that you gave the money back to the customer.");
      return;
    }

    complete.mutate(
      {
        id: item.id,
        restock,
        cashRefunded: isCard ? undefined : true,
        note: note.trim() || undefined,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title="Complete this return?" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-ink-soft">
          {returnNumber(item.id)} · {item.user.name}. Do this when the items have arrived.
        </p>

        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={restock}
            onChange={(event) => setRestock(event.target.checked)}
            className="mt-0.5 size-4 accent-primary-700"
          />
          <span>
            <span className="font-medium">Put the items back on the shelves</span>
            <span className="block text-xs text-ink-muted">
              Their stock grows. Leave it off for items that cannot be sold again, for example defective ones.
            </span>
          </span>
        </label>

        {isCard ? (
          <p className="rounded-control bg-canvas px-3 py-2 text-sm text-ink-soft">
            {amount} is refunded to the card of the customer now (a partial refund through Stripe).
          </p>
        ) : (
          <div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={cashRefunded}
                onChange={(event) => {
                  setCashRefunded(event.target.checked);
                  setError(undefined);
                }}
                className="mt-0.5 size-4 accent-primary-700"
                aria-invalid={Boolean(error)}
              />
              <span>
                <span className="font-medium">I gave the customer {amount} back by hand</span>
                <span className="block text-xs text-ink-muted">
                  This was a cash order: pay it back by InstaPay or a wallet, then tick this box.
                </span>
              </span>
            </label>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
          </div>
        )}

        <Field id="complete-note" label="Note for the customer" hint="Optional.">
          <textarea
            id="complete-note"
            rows={2}
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="input resize-none"
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={complete.isPending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={complete.isPending} className="btn btn-primary">
            {complete.isPending ? "Completing..." : "Complete return"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RefundChip({
  item,
  retrying,
  onRetry,
}: {
  item: AdminReturn;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (item.status !== "COMPLETED") return null;
  if (item.order.paymentMethod !== "card") return <span className="badge badge-success">Paid back by hand</span>;

  if (item.refundStatus === "refunded") return <span className="badge badge-success">Refunded</span>;
  if (item.refundStatus === "none") return <span className="badge badge-neutral">Nothing to refund</span>;
  if (item.refundStatus === "pending") return <span className="badge badge-warning">Refund pending</span>;

  // "failed", or nothing recorded: the server stopped in the middle
  return (
    <button
      onClick={onRetry}
      disabled={retrying}
      title="Try to refund again"
      className="badge badge-danger cursor-pointer transition-colors hover:bg-red-100"
    >
      {retrying ? "Refunding..." : "Refund needed: retry"}
    </button>
  );
}

type Dialog = { kind: "approve" | "reject" | "complete"; item: AdminReturn };

export default function ReturnsView() {
  const retryRefund = useRetryReturnRefund();

  const [tab, setTab] = useState<AdminReturnTab>("requested");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Wait until the admin stops typing before asking the API
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...adminReturnsOptions({ tab, search: debouncedSearch, page }),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  const returns = data?.returnRequests ?? [];
  // There are returns, but the requested page is past the last one
  const pastLastPage = Boolean(data && returns.length === 0 && data.total > 0);

  function changeTab(next: AdminReturnTab) {
    setTab(next);
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Returns"
        description="Customers ask to send back items of a delivered order. Approve them, and complete them when the items arrive."
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Filter returns">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => changeTab(item.key)}
              aria-pressed={tab === item.key}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === item.key
                  ? "bg-primary-700 text-white"
                  : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
                }`}
            >
              {item.label}
              {data && <span className="ml-1.5 opacity-70">{data.counts[item.key]}</span>}
            </button>
          ))}
        </div>

        <div className="relative lg:w-80">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Return number, order number or customer"
            aria-label="Search returns"
            className="input pl-10"
          />
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the returns"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="skeleton h-40 w-full" />
          ))}
        </div>
      ) : pastLastPage ? (
        <EmptyState
          icon={Undo2Icon}
          title="There is nothing on this page"
          action={
            <button onClick={() => setPage(1)} className="btn btn-secondary">
              Go to the first page
            </button>
          }
        />
      ) : returns.length === 0 ? (
        <EmptyState icon={Undo2Icon} title={EMPTY[tab]} />
      ) : (
        <>
          <ul className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
            {returns.map((item) => (
              <li key={item.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-semibold">{returnNumber(item.id)}</p>
                    <p className="text-xs text-ink-muted">
                      Order {orderNumber(item.orderId)} · {paymentLabel(item.order.paymentMethod)} · asked{" "}
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ReturnStatusBadge status={item.status} />
                    <RefundChip
                      item={item}
                      retrying={retryRefund.isPending && retryRefund.variables === item.id}
                      onRetry={() => retryRefund.mutate(item.id)}
                    />
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-ink-muted">Items to return</p>
                    <ReturnItems items={item.items} />
                  </div>
                  <div className="space-y-2 text-sm">
                    <p>
                      <span className="text-ink-muted">Customer: </span>
                      {item.user.name} · {item.user.email}
                      {item.user.phone ? ` · ${item.user.phone}` : ""}
                    </p>
                    <p>
                      <span className="text-ink-muted">Reason: </span>
                      {reasonLabel(item.reason)}
                    </p>
                    {item.comment && (
                      <p className="whitespace-pre-line break-words text-ink-soft">&ldquo;{item.comment}&rdquo;</p>
                    )}
                    <p>
                      <span className="text-ink-muted">Refund: </span>
                      <strong>{formatPrice(item.refundAmount)}</strong>{" "}
                      <span className="text-xs text-ink-muted">(delivery is not refunded)</span>
                    </p>
                    {item.adminNote && <p className="text-xs text-ink-soft">Note: {item.adminNote}</p>}
                    {item.status === "COMPLETED" && (
                      <p className="text-xs text-ink-muted">
                        Completed {item.completedAt ? formatDateTime(item.completedAt) : ""} ·{" "}
                        {item.restocked ? "back on the shelves" : "not put back on the shelves"}
                      </p>
                    )}
                  </div>
                </div>

                {(item.status === "REQUESTED" || item.status === "APPROVED") && (
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                    <button
                      onClick={() => setDialog({ kind: "reject", item })}
                      className="btn btn-secondary btn-sm hover:text-danger"
                    >
                      Refuse
                    </button>
                    {item.status === "REQUESTED" ? (
                      <button onClick={() => setDialog({ kind: "approve", item })} className="btn btn-primary btn-sm">
                        Approve
                      </button>
                    ) : (
                      <button onClick={() => setDialog({ kind: "complete", item })} className="btn btn-primary btn-sm">
                        Items arrived: complete
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {data && <Pager page={data.page} pages={data.pages} onChange={setPage} className="mt-6" />}
        </>
      )}

      {dialog && dialog.kind !== "complete" && (
        <DecisionDialog kind={dialog.kind} item={dialog.item} onClose={() => setDialog(null)} />
      )}
      {dialog && dialog.kind === "complete" && <CompleteDialog item={dialog.item} onClose={() => setDialog(null)} />}
    </>
  );
}