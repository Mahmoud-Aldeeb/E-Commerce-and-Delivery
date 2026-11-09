"use client";

import { useState } from "react";
import Image from "next/image";
import { MinusIcon, PlusIcon } from "lucide-react";
import Modal from "@/components/ui/modal";
import { lineKey } from "@/lib/cart-line";
import { formatDate, formatPrice } from "@/lib/format";
import { useCreateReturn, type OrderReturns } from "@/lib/queries/returns";
import { RETURN_REASONS } from "@/lib/returns";
import type { Order, ReturnReason } from "@/types";

interface ReturnDialogProps {
  order: Order;
  data: OrderReturns;
  onClose: () => void;
}

type Errors = { items?: string; reason?: string };

export default function ReturnDialog({ order, data, onClose }: ReturnDialogProps) {
  const create = useCreateReturn();
  // Only the lines that still have units to return
  const lines = data.lines.filter((line) => line.available > 0);

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const isCard = order.paymentMethod === "card";
  const endsAt = data.eligibility.windowEndsAt;

  function change(key: string, next: number, max: number) {
    setQuantities((current) => ({ ...current, [key]: Math.min(Math.max(next, 0), max) }));
    setErrors((current) => ({ ...current, items: undefined }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const items = lines.flatMap((line) => {
      const quantity = quantities[lineKey(line.product, line.variant)] ?? 0;
      return quantity > 0 ? [{ product: line.product, variant: line.variant, quantity }] : [];
    });

    const found: Errors = {};
    if (items.length === 0) found.items = "Choose at least one item to return.";
    if (!reason) found.reason = "Choose why you are returning the items.";

    setErrors(found);
    if (Object.keys(found).length > 0 || !reason) return;

    create.mutate(
      { orderId: order.id, items, reason, comment: comment.trim() || undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title="Return items" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <p className="rounded-control bg-canvas px-3 py-2 text-sm text-ink-soft">
          {isCard
            ? "The money goes back to the card you paid with. Banks usually take 5 to 10 business days to show it."
            : "You paid in cash, so the store sends the money back by hand (InstaPay or a mobile wallet) and will contact you."}{" "}
          You get the price of the items you return, with their share of the tax and of any discount. Delivery is not
          refunded.
          {endsAt ? ` You can ask until ${formatDate(endsAt)}.` : ""}
        </p>

        <fieldset>
          <legend className="field-label">What are you returning?</legend>
          <ul className="max-h-64 space-y-3 overflow-y-auto">
            {lines.map((line) => {
              const key = lineKey(line.product, line.variant);
              const quantity = quantities[key] ?? 0;

              return (
                <li key={key} className="flex items-center gap-3">
                  {line.image ? (
                    <Image
                      src={line.image}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-control bg-canvas object-cover"
                    />
                  ) : (
                    <span className="size-11 shrink-0 rounded-control bg-canvas" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-ink-muted">
                      {line.variantLabel ? `${line.variantLabel} · ` : ""}
                      {formatPrice(line.price)} each · up to {line.available}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => change(key, quantity - 1, line.available)}
                      disabled={quantity <= 0}
                      className="btn btn-secondary size-7 p-0"
                      aria-label={`Return fewer of ${line.name}`}
                    >
                      <MinusIcon className="size-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold" aria-live="polite">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => change(key, quantity + 1, line.available)}
                      disabled={quantity >= line.available}
                      className="btn btn-secondary size-7 p-0"
                      aria-label={`Return more of ${line.name}`}
                    >
                      <PlusIcon className="size-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {errors.items && (
            <p role="alert" className="field-error">
              {errors.items}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="field-label">Why are you returning them?</legend>
          <div className="space-y-2">
            {RETURN_REASONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-control border px-3 py-2.5 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${reason === option.value ? "border-primary-600 bg-primary-50" : "border-line hover:border-line-strong"
                  }`}
              >
                <input
                  type="radio"
                  name="return-reason"
                  checked={reason === option.value}
                  onChange={() => {
                    setReason(option.value);
                    setErrors((current) => ({ ...current, reason: undefined }));
                  }}
                  className="size-4 accent-primary-700"
                />
                {option.label}
              </label>
            ))}
          </div>
          {errors.reason && (
            <p role="alert" className="field-error">
              {errors.reason}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="return-comment" className="field-label">
            Tell us more (optional)
          </label>
          <textarea
            id="return-comment"
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            className="input resize-none"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={create.isPending} className="btn btn-secondary">
            Close
          </button>
          <button type="submit" disabled={create.isPending} className="btn btn-primary">
            {create.isPending ? "Sending..." : "Send request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}