"use client";

import { useState } from "react";
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

// What the store said, and where the money is, in words a customer understands
function StatusNote({ request, isCard }: { request: ReturnRequest; isCard: boolean }) {
  const amount = formatPrice(request.refundAmount);
  let text: string | null = null;

  if (request.status === "REQUESTED") {
    text = `The store will answer soon. If it is approved and the items arrive, you get ${amount} back. You can cancel until it answers.`;
  } else if (request.status === "APPROVED") {
    text = `Approved. ${request.adminNote ?? "Contact the store to arrange how to send the items back."
      } Your refund of ${amount} comes after the items arrive.`;
  } else if (request.status === "COMPLETED") {
    if (!isCard) text = `The store paid you back ${amount} by hand.`;
    else if (request.refundStatus === "refunded")
      text = `${amount} was returned to your card. Banks usually take 5 to 10 business days to show it.`;
    else if (request.refundStatus === "none") text = "Completed. There was nothing to refund.";
    else if (request.refundStatus === "pending") text = `Your refund of ${amount} is being processed.`;
    else text = `Your refund of ${amount} is being reviewed by our team. You do not need to do anything.`;
  } else if (request.status === "REJECTED") {
    text = request.adminNote ? `The store refused this return: ${request.adminNote}` : "The store refused this return.";
  } else {
    text = "You cancelled this return.";
  }

  return <p className="mt-2 text-xs text-ink-soft">{text}</p>;
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
  const isCard = order.paymentMethod === "card";

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Returns</h2>

      {eligibility.eligible && hasUnits ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">
            You can return items until {formatDate(eligibility.windowEndsAt)}.
          </p>
          <button onClick={() => setAsking(true)} className="btn btn-secondary btn-sm mt-3 w-full">
            <Undo2Icon className="size-4" /> Return items
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

              <StatusNote request={request} isCard={isCard} />

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