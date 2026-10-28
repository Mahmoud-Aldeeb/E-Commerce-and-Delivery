"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { formatPrice } from "@/lib/format";
import { orderNumber } from "@/lib/orders";
import { useCancelOrder } from "@/lib/queries/orders";
import type { Order } from "@/types";

const REASONS = [
  "Ordered by mistake",
  "I changed my mind",
  "Found a better price",
  "Delivery is taking too long",
  "Other",
];

export default function CancelOrderDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const cancel = useCancelOrder();
  const [choice, setChoice] = useState(REASONS[0]);
  const [details, setDetails] = useState("");

  const isCard = order.paymentMethod === "card";
  // The reason is optional: "Other" without details sends no reason
  const reason = choice === "Other" ? details.trim() : choice;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancel.mutate({ id: order.id, reason: reason || undefined }, { onSuccess: onClose });
  }

  return (
    <Modal title="Cancel this order?" onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-ink-soft">Order {orderNumber(order.id)}.</p>

        <p className="mt-3 rounded-control bg-canvas px-3 py-2 text-sm text-ink-soft">
          {isCard
            ? `You will get ${formatPrice(order.total)} back on the card you paid with. Banks usually take 5 to 10 business days to show it.`
            : "You have not paid anything, so nothing is charged."}
        </p>

        <fieldset className="mt-4">
          <legend className="field-label">Why are you cancelling? (optional)</legend>
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

        {choice === "Other" && (
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
          <button type="button" onClick={onClose} disabled={cancel.isPending} className="btn btn-secondary">
            Keep order
          </button>
          <button type="submit" disabled={cancel.isPending} className="btn btn-danger">
            {cancel.isPending ? "Cancelling..." : "Cancel order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}