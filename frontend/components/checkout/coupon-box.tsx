"use client";

import { useState } from "react";
import { CheckIcon, Loader2Icon, TagIcon, XIcon } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { CheckoutCoupon } from "@/lib/queries/coupons";

export default function CouponBox({ coupon }: { coupon: CheckoutCoupon }) {
  const [text, setText] = useState("");

  const isChecking = coupon.status === "checking";
  const hasError = coupon.status === "error";

  // A code that works (or is being checked) shows as a chip; otherwise the form is shown
  if (coupon.code !== null && !hasError) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-control bg-success-soft px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          {isChecking ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin" />
          ) : (
            <CheckIcon className="size-4 shrink-0 text-success" />
          )}
          <span className="truncate font-medium">{coupon.code}</span>
          {!isChecking && (
            <span className="shrink-0 text-ink-soft">-{formatPrice(coupon.discount)}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            coupon.remove();
            setText("");
          }}
          aria-label={`Remove the coupon ${coupon.code}`}
          className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:text-danger"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        coupon.apply(text);
      }}
    >
      <label htmlFor="coupon-code" className="field-label flex items-center gap-1.5">
        <TagIcon className="size-3.5" /> Coupon code
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          className={`input min-w-0 flex-1 uppercase ${hasError ? "input-error" : ""}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Enter a code"
          autoComplete="off"
          maxLength={32}
          aria-invalid={hasError}
          aria-describedby={hasError ? "coupon-code-error" : undefined}
        />
        <button type="submit" disabled={!text.trim()} className="btn btn-secondary">
          Apply
        </button>
      </div>

      {hasError && (
        <p id="coupon-code-error" role="alert" className="field-error">
          {coupon.message}
        </p>
      )}
      {hasError && (
        <button
          type="button"
          onClick={() => {
            coupon.remove();
            setText("");
          }}
          className="mt-1 text-xs font-medium text-primary-700 hover:underline"
        >
          Remove the coupon
        </button>
      )}
    </form>
  );
}