"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { orderNumber } from "@/lib/orders";
import { useCancelDelivery } from "@/lib/queries/delivery";
import type { Order } from "@/types";

const REASONS = [
  "Customer is not answering",
  "Wrong or unreachable address",
  "Customer refused the order",
  "Other",
];

export default function CancelDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const cancel = useCancelDelivery();
  const [choice, setChoice] = useState(REASONS[0]);
  const [details, setDetails] = useState("");

  const isOther = choice === "Other";
  const reason = isOther ? details.trim() : choice;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) return;
    cancel.mutate({ id: order.id, reason }, { onSuccess: onClose });
  }

  return (
    <Modal title="Cancel this delivery?" onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-ink-soft">
          Order {orderNumber(order.id)} will show as cancelled to the customer, the items go back
          to stock, and a card payment is refunded automatically. Use this only when the delivery
          cannot be completed.
        </p>

        <fieldset className="mt-4">
          <legend className="field-label">Reason</legend>
          <div className="space-y-2">
            {REASONS.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${choice === option ? "border-primary-600 bg-primary-50" : "border-line hover:border-line-strong"
                  }`}
              >
                <input
                  type="radio"
                  name="cancel-reason"
                  checked={choice === option}
                  onChange={() => setChoice(option)}
                  className="size-4 accent-primary-700"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        {isOther && (
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={3}
            maxLength={200}
            placeholder="Tell us what happened"
            aria-label="Cancellation reason"
            className="input mt-3 resize-none"
          />
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Back
          </button>
          <button type="submit" disabled={!reason || cancel.isPending} className="btn btn-danger">
            {cancel.isPending ? "Cancelling..." : "Cancel delivery"}
          </button>
        </div>
      </form>
    </Modal>
  );
}