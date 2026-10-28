"use client";

import { useState } from "react";
import Modal from "@/components/ui/modal";
import { getErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { orderNumber } from "@/lib/orders";
import { useCompleteDelivery } from "@/lib/queries/delivery";
import type { Order } from "@/types";

export default function OtpDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const complete = useCompleteDelivery();
  const [otp, setOtp] = useState("");
  const isCash = order.paymentMethod !== "card";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) return;
    complete.mutate({ id: order.id, otp }, { onSuccess: onClose });
  }

  return (
    <Modal title="Confirm delivery" onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-ink-soft">
          Order {orderNumber(order.id)}. Ask the customer for the 6-digit code shown on their
          tracking page.
        </p>

        {isCash && (
          <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
            Collect {formatPrice(order.total)} in cash before you confirm.
          </p>
        )}

        <label htmlFor="delivery-code" className="field-label mt-5">
          Delivery code
        </label>
        <input
          id="delivery-code"
          value={otp}
          onChange={(event) => {
            setOtp(event.target.value.replace(/\D/g, ""));
            if (complete.isError) complete.reset();
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          autoFocus
          aria-invalid={complete.isError}
          aria-describedby={complete.isError ? "delivery-code-error" : undefined}
          className={`input text-center font-mono text-2xl tracking-[0.5em] ${complete.isError ? "input-error" : ""
            }`}
        />
        {complete.isError && (
          <p id="delivery-code-error" role="alert" className="field-error">
            {getErrorMessage(complete.error)}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={otp.length !== 6 || complete.isPending}
            className="btn btn-primary"
          >
            {complete.isPending ? "Verifying..." : "Confirm delivery"}
          </button>
        </div>
      </form>
    </Modal>
  );
}