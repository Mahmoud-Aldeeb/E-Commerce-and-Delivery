"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Undo2Icon } from "lucide-react";
import ReturnDialog from "@/components/orders/return-dialog";
import ReturnItems from "@/components/returns/return-items";
import ReturnStatusBadge from "@/components/returns/return-status-badge";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { formatDate, formatDateTime, formatPrice } from "@/lib/format";
import { orderReturnsOptions, useCancelReturn } from "@/lib/queries/returns";
import { reasonLabel, returnNumber } from "@/lib/returns";
import type { Order, ReturnRequest } from "@/types";

const round2 = (value: number) => Math.round(value * 100) / 100;

// "your mobile wallet (01012345678)", "your InstaPay (mona@instapay)", "your card"
function destinationOf(request: ReturnRequest): string {
  const details = request.refundDestinationDetails ? ` (${request.refundDestinationDetails})` : "";
  if (request.refundMethod === "MOBILE_WALLET") return `your mobile wallet${details}`;
  if (request.refundMethod === "INSTAPAY") return `your InstaPay${details}`;
  return "your card";
}

// Where the money will go, before it is paid
function whereItGoes(request: ReturnRequest): string {
  const wallet = request.walletRefundAmount;
  const rest = round2(request.refundAmount - wallet);

  if (rest <= 0) return `${formatPrice(request.refundAmount)} is added to your store wallet`;
  if (wallet > 0) return `${formatPrice(wallet)} is added to your store wallet and ${formatPrice(rest)} goes to ${destinationOf(request)}`;
  return `${formatPrice(request.refundAmount)} goes to ${destinationOf(request)}`;
}

// What the store said, and where the money is, in words a customer understands
function StatusNote({ request }: { request: ReturnRequest }) {
  let text: string;

  if (request.status === "REQUESTED") {
    text = `The store will answer soon. If it approves the return and receives the items, ${whereItGoes(request)}. You can cancel until it answers.`;
  } else if (request.status === "APPROVED") {
    text = `Approved. ${request.adminNote ?? "Contact the store to arrange how to send the items back."} When the items arrive, ${whereItGoes(request)}.`;
  } else if (request.status === "COMPLETED") {
    const wallet = request.walletRefundAmount;
    const rest = round2(request.refundAmount - wallet);
    const parts: string[] = [];

    if (wallet > 0) parts.push(`${formatPrice(wallet)} was added to your store wallet.`);
    if (rest > 0 && request.refundMethod === "ORIGINAL_PAYMENT") {
      if (request.refundStatus === "refunded")
        parts.push(`${formatPrice(rest)} was returned to your card. Banks usually take 5 to 10 business days to show it.`);
      else if (request.refundStatus === "pending") parts.push(`Your refund of ${formatPrice(rest)} is being processed.`);
      else parts.push(`Your refund of ${formatPrice(rest)} is being reviewed by our team. You do not need to do anything.`);
    } else if (rest > 0) {
      parts.push(
        request.refundStatus === "manual-pending"
          ? `The store will send ${formatPrice(rest)} to ${destinationOf(request)}. It can take a few days.`
          : `The store sent ${formatPrice(rest)} to ${destinationOf(request)}.`,
      );
    }
    text = parts.length > 0 ? parts.join(" ") : "Completed. There was nothing to refund.";
  } else if (request.status === "REJECTED") {
    text = request.adminNote ? `The store refused this return: ${request.adminNote}` : "The store refused this return.";
  } else {
    text = "You cancelled this return.";
  }

  return (
    <p className="mt-2 text-xs text-ink-soft">
      {text}
      {request.status === "COMPLETED" && request.walletRefundAmount > 0 && (
        <>
          {" "}
          <Link href="/wallet" className="font-medium text-primary-700 hover:underline">
            See your wallet
          </Link>
        </>
      )}
    </p>
  );
}

// On the page of a delivered order: can it be returned, and the returns it already has
export default function ReturnsSection({ order }: { order: Order }) {
  const { data, isPending, isError, refetch } = useQuery(orderReturnsOptions(order.id));
  const cancel = useCancelReturn();
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState<ReturnRequest | null>(null);

  if (isPending) return <div className="skeleton h-28 w-full" aria-busy="true" />;

  if (isError || !data) {
    return (
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Returns</h2>
        <p className="mt-1 text-xs text-ink-muted">We couldn&apos;t load the returns of this order.</p>
        <button onClick={() => refetch()} className="btn btn-secondary btn-sm mt-3 w-full">
          Try again
        </button>
      </section>
    );
  }

  const eligibility = data.eligibility;
  const hasUnits = data.lines.some((line) => line.available > 0);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Returns</h2>

      {eligibility.eligible && hasUnits ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">
            If an item has a manufacturing defect, you can return it until {formatDate(eligibility.windowEndsAt)}.
          </p>
          <button onClick={() => setAsking(true)} className="btn btn-secondary btn-sm mt-3 w-full">
            <Undo2Icon className="size-4" /> Return a defective item
          </button>
        </>
      ) : !eligibility.eligible ? (
        <p className="mt-1 text-xs text-ink-muted">{eligibility.message}.</p>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">Every item of this order is already in a return.</p>
      )}

      {data.returnRequests.length > 0 && (
        <ul className="mt-4 space-y-5 border-t border-line pt-4">
          {data.returnRequests.map((request) => (
            <li key={request.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs font-semibold">{returnNumber(request.id)}</p>
                  <p className="text-xs text-ink-muted">{formatDateTime(request.createdAt)}</p>
                </div>
                <ReturnStatusBadge status={request.status} />
              </div>

              <div className="mt-3">
                <ReturnItems items={request.items} />
              </div>
              <p className="mt-2 text-xs text-ink-soft">
                {reasonLabel(request.reason)}
                {request.comment ? `: ${request.comment}` : ""}
              </p>

              <StatusNote request={request} />

              {request.status === "REQUESTED" && (
                <button
                  onClick={() => setCancelling(request)}
                  className="btn btn-secondary btn-sm mt-3 w-full hover:text-danger"
                >
                  Cancel request
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {asking && <ReturnDialog order={order} data={data} onClose={() => setAsking(false)} />}

      {cancelling && (
        <ConfirmDialog
          title="Cancel this return request?"
          description="The items stay with you and nothing is refunded. You can ask again while the return days last."
          confirmLabel="Cancel request"
          isPending={cancel.isPending}
          onConfirm={() => cancel.mutate(cancelling.id, { onSuccess: () => setCancelling(null) })}
          onCancel={() => setCancelling(null)}
        />
      )}
    </section>
  );
}