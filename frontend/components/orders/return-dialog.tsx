"use client";

import Image from "next/image";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MinusIcon, PlusIcon } from "lucide-react";
import { z } from "zod";
import Modal from "@/components/ui/modal";
import { lineKey } from "@/lib/cart-line";
import { formatDate, formatPrice } from "@/lib/format";
import { useCreateReturn, type NewReturn, type OrderReturns } from "@/lib/queries/returns";
import { isInstapayAddress, normalizeMobile } from "@/lib/refund-destination";
import type { Order, ReturnRefundMethod } from "@/types";

// What the customer can choose for a cash order. The first one is pre-selected
const REFUND_OPTIONS: {
  value: ReturnRefundMethod;
  label: string;
  description: string;
  badge?: string;
}[] = [
    {
      value: "STORE_WALLET",
      label: "Store wallet",
      badge: "Fastest - available immediately",
      description:
        "The money is added to your wallet as soon as the store receives the item. Use it on your next order.",
    },
    {
      value: "MOBILE_WALLET",
      label: "Vodafone Cash / mobile wallet",
      description: "The store sends the money to your mobile wallet. It can take a few days.",
    },
    {
      value: "INSTAPAY",
      label: "InstaPay / bank transfer",
      description: "The store sends the money by InstaPay. It can take a few days.",
    },
  ];

// A field is only required when its own refund method is selected
const schema = z
  .object({
    quantities: z.record(z.string(), z.number()),
    // Only a manufacturing defect can be returned: the store decides from this description
    comment: z
      .string()
      .refine((value) => value.trim().length >= 10, "Describe the defect in a few words (at least 10 characters).")
      .refine((value) => value.trim().length <= 500, "The description must be 500 characters or fewer."),
    refundMethod: z.string(),
    mobile: z.string(),
    instapay: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!Object.values(values.quantities).some((quantity) => quantity > 0)) {
      ctx.addIssue({ code: "custom", path: ["quantities"], message: "Choose at least one item to return." });
    }
    if (values.refundMethod === "MOBILE_WALLET" && !normalizeMobile(values.mobile)) {
      ctx.addIssue({
        code: "custom",
        path: ["mobile"],
        message: "Enter the mobile number of your wallet, like 01012345678.",
      });
    }
    if (
      values.refundMethod === "INSTAPAY" &&
      !isInstapayAddress(values.instapay) &&
      !normalizeMobile(values.instapay)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["instapay"],
        message: "Enter your InstaPay address (like name@instapay) or the mobile number linked to it.",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

interface ReturnDialogProps {
  order: Order;
  data: OrderReturns;
  onClose: () => void;
}

export default function ReturnDialog({ order, data, onClose }: ReturnDialogProps) {
  const create = useCreateReturn();
  // Only the lines that still have units to return
  const lines = data.lines.filter((line) => line.available > 0);
  // The way the order was paid decides what can be chosen: the first method is the default
  const methods: ReturnRefundMethod[] = data.refundMethods?.length ? data.refundMethods : ["STORE_WALLET"];
  const canChoose = methods.length > 1;
  const walletPaid = order.walletAmountUsed ?? 0;
  const endsAt = data.eligibility.windowEndsAt;

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantities: {},
      comment: "",
      refundMethod: methods[0],
      mobile: "",
      instapay: "",
    },
  });
  // useWatch (not watch): the compiler of React can memoize it safely
  const method = useWatch({ control, name: "refundMethod" });

  // The error of a record field can also be an object (one error per key): only a text is shown
  const quantitiesError = errors.quantities?.message;
  const quantitiesMessage = typeof quantitiesError === "string" ? quantitiesError : undefined;

  function onSubmit(values: FormValues) {
    const items = lines.flatMap((line) => {
      const quantity = values.quantities[lineKey(line.product, line.variant)] ?? 0;
      return quantity > 0 ? [{ product: line.product, variant: line.variant, quantity }] : [];
    });

    const request: NewReturn = {
      orderId: order.id,
      items,
      reason: "DEFECTIVE",
      comment: values.comment.trim(),
    };
    if (canChoose) {
      request.refundMethod = values.refundMethod as ReturnRefundMethod;
      if (values.refundMethod === "MOBILE_WALLET") request.refundDestinationDetails = values.mobile.trim();
      if (values.refundMethod === "INSTAPAY") request.refundDestinationDetails = values.instapay.trim();
    }

    create.mutate(request, { onSuccess: onClose });
  }

  return (
    <Modal title="Return a defective item" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <p className="rounded-control bg-canvas px-3 py-2 text-sm text-ink-soft">
          Only an item with a manufacturing defect can be returned. If the store approves the return, it tells you how
          to send the item back, and sending it is at your own cost. You get the price of the items, with their share
          of the tax and of any discount. Delivery is not refunded.
          {endsAt ? ` You can ask until ${formatDate(endsAt)}.` : ""}
        </p>

        <fieldset>
          <legend className="field-label">Which items have a defect?</legend>
          <Controller
            name="quantities"
            control={control}
            render={({ field }) => (
              <ul className="max-h-64 space-y-3 overflow-y-auto">
                {lines.map((line) => {
                  const key = lineKey(line.product, line.variant);
                  const quantity = field.value[key] ?? 0;
                  const change = (next: number) =>
                    field.onChange({ ...field.value, [key]: Math.min(Math.max(next, 0), line.available) });

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
                          onClick={() => change(quantity - 1)}
                          disabled={quantity <= 0}
                          className="btn btn-secondary size-9 p-0"
                          aria-label={`Return fewer of ${line.name}`}
                        >
                          <MinusIcon className="size-4" />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold" aria-live="polite">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => change(quantity + 1)}
                          disabled={quantity >= line.available}
                          className="btn btn-secondary size-9 p-0"
                          aria-label={`Return more of ${line.name}`}
                        >
                          <PlusIcon className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          />
          {quantitiesMessage && (
            <p role="alert" className="field-error">
              {quantitiesMessage}
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor="return-comment" className="field-label">
            What is the defect?
          </label>
          <textarea
            id="return-comment"
            rows={4}
            maxLength={500}
            placeholder="For example: the zipper broke the first time I used it"
            className={`input resize-none ${errors.comment ? "input-error" : ""}`}
            aria-invalid={Boolean(errors.comment)}
            aria-describedby={errors.comment ? "return-comment-error" : undefined}
            {...register("comment")}
          />
          {errors.comment?.message && (
            <p id="return-comment-error" role="alert" className="field-error">
              {errors.comment.message}
            </p>
          )}
        </div>

        <fieldset>
          <legend className="field-label">Where should the refund go?</legend>
          {canChoose ? (
            <div className="space-y-2">
              {REFUND_OPTIONS.map((option) => {
                const selected = method === option.value;

                return (
                  <div
                    key={option.value}
                    className={`rounded-control border transition-colors ${selected ? "border-primary-600 bg-primary-50" : "border-line"
                      }`}
                  >
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-primary-600/30">
                      <input
                        type="radio"
                        value={option.value}
                        className="mt-0.5 size-4 accent-primary-700"
                        {...register("refundMethod")}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {option.label}
                          {option.badge && <span className="badge badge-success">{option.badge}</span>}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-soft">{option.description}</span>
                      </span>
                    </label>

                    {selected && option.value === "MOBILE_WALLET" && (
                      <div className="px-3 pb-3 pl-10">
                        <label htmlFor="return-mobile" className="field-label">
                          Mobile number of your wallet
                        </label>
                        <input
                          id="return-mobile"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="01012345678"
                          className={`input ${errors.mobile ? "input-error" : ""}`}
                          aria-invalid={Boolean(errors.mobile)}
                          aria-describedby={errors.mobile ? "return-mobile-error" : undefined}
                          {...register("mobile")}
                        />
                        {errors.mobile?.message && (
                          <p id="return-mobile-error" role="alert" className="field-error">
                            {errors.mobile.message}
                          </p>
                        )}
                      </div>
                    )}

                    {selected && option.value === "INSTAPAY" && (
                      <div className="px-3 pb-3 pl-10">
                        <label htmlFor="return-instapay" className="field-label">
                          InstaPay address or mobile number
                        </label>
                        <input
                          id="return-instapay"
                          autoComplete="off"
                          placeholder="name@instapay"
                          className={`input ${errors.instapay ? "input-error" : ""}`}
                          aria-invalid={Boolean(errors.instapay)}
                          aria-describedby={errors.instapay ? "return-instapay-error" : undefined}
                          {...register("instapay")}
                        />
                        {errors.instapay?.message && (
                          <p id="return-instapay-error" role="alert" className="field-error">
                            {errors.instapay.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-control bg-canvas px-3 py-2 text-sm text-ink-soft">
              {methods[0] === "ORIGINAL_PAYMENT"
                ? "The money goes back to the card you paid with. Banks usually take 5 to 10 business days to show it."
                : "The money goes back to your store wallet, so you can use it on your next order."}
            </p>
          )}
          {walletPaid > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              The {formatPrice(walletPaid)} you paid from your wallet goes back to your wallet first.
            </p>
          )}
        </fieldset>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={create.isPending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={create.isPending} className="btn btn-primary">
            {create.isPending ? "Sending..." : "Send return request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}