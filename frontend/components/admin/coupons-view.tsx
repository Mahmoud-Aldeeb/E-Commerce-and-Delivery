"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import Field from "@/components/admin/field";
import PageHeader from "@/components/admin/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import Modal from "@/components/ui/modal";
import {
  couponState,
  describeConditions,
  describeDiscount,
  fromLocalInput,
  toLocalInput,
  type CouponState,
} from "@/lib/coupons";
import {
  adminCouponsOptions,
  useDeleteCoupon,
  useSaveCoupon,
  type AdminCoupon,
  type CouponKind,
} from "@/lib/queries/coupons";

// The same rules as the API: the server has the last word
const CODE_PATTERN = /^[A-Z0-9_-]{3,32}$/;

const STATE_BADGE: Record<CouponState, { label: string; className: string }> = {
  active: { label: "Active", className: "badge-success" },
  inactive: { label: "Inactive", className: "badge-neutral" },
  scheduled: { label: "Scheduled", className: "badge-primary" },
  expired: { label: "Expired", className: "badge-danger" },
  exhausted: { label: "Used up", className: "badge-warning" },
};

const hasMoreThanTwoDecimals = (value: number) => Math.round(value * 100) / 100 !== value;

// An optional number: an empty box means "no limit"
function parseOptional(
  text: string,
  options: { min: number; integer?: boolean; message: string },
): { value: number | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { value: null, error: null };

  const number = Number(trimmed);
  const valid =
    Number.isFinite(number) &&
    number >= options.min &&
    (options.integer ? Number.isInteger(number) : !hasMoreThanTwoDecimals(number));
  return valid ? { value: number, error: null } : { value: null, error: options.message };
}

type ErrorKey =
  | "code"
  | "value"
  | "maxDiscount"
  | "minSubtotal"
  | "expiresAt"
  | "usageLimit"
  | "perUserLimit";
type Errors = Partial<Record<ErrorKey, string>>;

function CouponDialog({
  coupon,
  onClose,
}: {
  /** Absent = a new coupon */
  coupon?: AdminCoupon;
  onClose: () => void;
}) {
  const save = useSaveCoupon();

  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponKind>(coupon?.type ?? "PERCENT");
  const [value, setValue] = useState(coupon ? String(coupon.value) : "");
  const [maxDiscount, setMaxDiscount] = useState(
    coupon?.maxDiscount != null ? String(coupon.maxDiscount) : "",
  );
  const [minSubtotal, setMinSubtotal] = useState(
    coupon?.minSubtotal != null ? String(coupon.minSubtotal) : "",
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(coupon?.startsAt ?? null));
  const [expiresAt, setExpiresAt] = useState(toLocalInput(coupon?.expiresAt ?? null));
  const [usageLimit, setUsageLimit] = useState(
    coupon?.usageLimit != null ? String(coupon.usageLimit) : "",
  );
  const [perUserLimit, setPerUserLimit] = useState(
    coupon?.perUserLimit != null ? String(coupon.perUserLimit) : "",
  );
  const [isActive, setIsActive] = useState(coupon?.isActive ?? true);
  const [errors, setErrors] = useState<Errors>({});

  const clear = (key: ErrorKey) => setErrors((current) => ({ ...current, [key]: undefined }));
  const inputClass = (key: ErrorKey) => `input ${errors[key] ? "input-error" : ""}`;
  const describedBy = (key: ErrorKey, id: string) => (errors[key] ? `${id}-error` : undefined);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Errors = {};

    const cleanCode = code.trim().toUpperCase();
    if (!coupon && !CODE_PATTERN.test(cleanCode)) {
      found.code = "Use 3 to 32 letters, numbers, dashes or underscores.";
    }

    const amount = Number(value);
    if (value.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
      found.value = "Enter a number above 0.";
    } else if (hasMoreThanTwoDecimals(amount)) {
      found.value = "Use at most 2 decimals.";
    } else if (type === "PERCENT" && amount > 100) {
      found.value = "A percentage cannot be more than 100.";
    }

    const max = parseOptional(maxDiscount, {
      min: 0.01,
      message: "Enter an amount above 0 (2 decimals at most), or leave it empty.",
    });
    if (type === "PERCENT" && max.error) found.maxDiscount = max.error;

    const min = parseOptional(minSubtotal, {
      min: 0,
      message: "Enter 0 or more (2 decimals at most), or leave it empty.",
    });
    if (min.error) found.minSubtotal = min.error;

    const total = parseOptional(usageLimit, {
      min: 1,
      integer: true,
      message: "Enter a whole number from 1, or leave it empty.",
    });
    if (total.error) found.usageLimit = total.error;

    const perUser = parseOptional(perUserLimit, {
      min: 1,
      integer: true,
      message: "Enter a whole number from 1, or leave it empty.",
    });
    if (perUser.error) found.perUserLimit = perUser.error;

    const start = fromLocalInput(startsAt);
    const end = fromLocalInput(expiresAt);
    if (start && end && new Date(end).getTime() <= new Date(start).getTime()) {
      found.expiresAt = "The end must be after the start.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body = {
      type,
      value: amount,
      // A maximum discount only makes sense for a percentage
      maxDiscount: type === "PERCENT" ? max.value : null,
      minSubtotal: min.value,
      startsAt: start,
      expiresAt: end,
      usageLimit: total.value,
      perUserLimit: perUser.value,
      isActive,
    };

    save.mutate(coupon ? { id: coupon.id, ...body } : { code: cleanCode, ...body }, {
      onSuccess: onClose,
    });
  }

  return (
    <Modal title={coupon ? "Edit coupon" : "New coupon"} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {coupon ? (
          <div>
            <p className="field-label">Code</p>
            <p className="text-sm">
              <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">{coupon.code}</code>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              The code appears on the orders that used it, so it cannot be changed.
            </p>
          </div>
        ) : (
          <Field
            id="coupon-code"
            label="Code"
            error={errors.code}
            hint="Letters, numbers, dashes or underscores. It is saved in capitals and cannot be changed later."
          >
            <input
              id="coupon-code"
              className={`${inputClass("code")} uppercase`}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                clear("code");
              }}
              maxLength={32}
              autoFocus
              autoComplete="off"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={describedBy("code", "coupon-code")}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="coupon-type" label="Type">
            <select
              id="coupon-type"
              className="input"
              value={type}
              onChange={(event) => setType(event.target.value as CouponKind)}
            >
              <option value="PERCENT">Percentage</option>
              <option value="FIXED">Fixed amount</option>
            </select>
          </Field>

          <Field
            id="coupon-value"
            label={type === "PERCENT" ? "Percentage off (%)" : "Amount off ($)"}
            error={errors.value}
          >
            <input
              id="coupon-value"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className={inputClass("value")}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                clear("value");
              }}
              aria-invalid={Boolean(errors.value)}
              aria-describedby={describedBy("value", "coupon-value")}
            />
          </Field>
        </div>

        {type === "PERCENT" && (
          <Field
            id="coupon-max"
            label="Maximum discount ($)"
            error={errors.maxDiscount}
            hint="Optional. The discount never goes above this."
          >
            <input
              id="coupon-max"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              className={inputClass("maxDiscount")}
              value={maxDiscount}
              onChange={(event) => {
                setMaxDiscount(event.target.value);
                clear("maxDiscount");
              }}
              aria-invalid={Boolean(errors.maxDiscount)}
              aria-describedby={describedBy("maxDiscount", "coupon-max")}
            />
          </Field>
        )}

        <Field
          id="coupon-min"
          label="Minimum order ($)"
          error={errors.minSubtotal}
          hint="Optional. The items must cost at least this, before the discount."
        >
          <input
            id="coupon-min"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={inputClass("minSubtotal")}
            value={minSubtotal}
            onChange={(event) => {
              setMinSubtotal(event.target.value);
              clear("minSubtotal");
            }}
            aria-invalid={Boolean(errors.minSubtotal)}
            aria-describedby={describedBy("minSubtotal", "coupon-min")}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="coupon-starts" label="Starts" hint="Optional. Your device time.">
            <input
              id="coupon-starts"
              type="datetime-local"
              className="input"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field id="coupon-expires" label="Ends" error={errors.expiresAt} hint="Optional. Your device time.">
            <input
              id="coupon-expires"
              type="datetime-local"
              className={inputClass("expiresAt")}
              value={expiresAt}
              onChange={(event) => {
                setExpiresAt(event.target.value);
                clear("expiresAt");
              }}
              aria-invalid={Boolean(errors.expiresAt)}
              aria-describedby={describedBy("expiresAt", "coupon-expires")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="coupon-usage"
            label="Total uses"
            error={errors.usageLimit}
            hint="Optional. Empty = no limit."
          >
            <input
              id="coupon-usage"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              className={inputClass("usageLimit")}
              value={usageLimit}
              onChange={(event) => {
                setUsageLimit(event.target.value);
                clear("usageLimit");
              }}
              aria-invalid={Boolean(errors.usageLimit)}
              aria-describedby={describedBy("usageLimit", "coupon-usage")}
            />
          </Field>
          <Field
            id="coupon-per-user"
            label="Uses per customer"
            error={errors.perUserLimit}
            hint="Optional. Empty = no limit."
          >
            <input
              id="coupon-per-user"
              type="number"
              step="1"
              min="1"
              inputMode="numeric"
              className={inputClass("perUserLimit")}
              value={perUserLimit}
              onChange={(event) => {
                setPerUserLimit(event.target.value);
                clear("perUserLimit");
              }}
              aria-invalid={Boolean(errors.perUserLimit)}
              aria-describedby={describedBy("perUserLimit", "coupon-per-user")}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary-700"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active: customers can use this code
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={save.isPending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className="btn btn-primary">
            {save.isPending ? "Saving..." : coupon ? "Save changes" : "Create coupon"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CouponsView() {
  const { data, isPending, isError, refetch } = useQuery(adminCouponsOptions());
  const save = useSaveCoupon();
  const remove = useDeleteCoupon();

  // null = closed, "new" = the create form, a coupon = its edit form
  const [dialog, setDialog] = useState<"new" | AdminCoupon | null>(null);
  const [target, setTarget] = useState<AdminCoupon | null>(null);

  const coupons = data ?? [];

  return (
    <>
      <PageHeader
        title="Coupons"
        description={
          data ? `${data.length} ${data.length === 1 ? "coupon" : "coupons"}` : undefined
        }
        action={
          <button onClick={() => setDialog("new")} className="btn btn-primary">
            <PlusIcon className="size-4" /> Add coupon
          </button>
        }
      />

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the coupons"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-canvas text-xs uppercase text-ink-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Code</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Discount</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Conditions</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Used</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {isPending ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={6} className="px-5 py-4">
                        <div className="skeleton h-8 w-full" />
                      </td>
                    </tr>
                  ))
                ) : coupons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-ink-muted">
                      No coupons yet. Add the first one.
                    </td>
                  </tr>
                ) : (
                  coupons.map((coupon) => {
                    const state = couponState(coupon);
                    const badge = STATE_BADGE[state];
                    const conditions = describeConditions(coupon);
                    return (
                      <tr key={coupon.id}>
                        <td className="px-5 py-3">
                          <code className="rounded bg-canvas px-1.5 py-0.5 font-semibold">
                            {coupon.code}
                          </code>
                        </td>
                        <td className="px-5 py-3 font-medium">{describeDiscount(coupon)}</td>
                        <td className="px-5 py-3 text-ink-soft">
                          {conditions.length === 0 ? (
                            <span className="text-ink-muted">None</span>
                          ) : (
                            conditions.map((line) => <p key={line}>{line}</p>)
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {coupon.redeemedCount}
                          {coupon.usageLimit !== null && (
                            <span className="text-ink-muted"> / {coupon.usageLimit}</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`badge ${badge.className}`}>{badge.label}</span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => save.mutate({ id: coupon.id, isActive: !coupon.isActive })}
                              disabled={save.isPending}
                              className="btn btn-ghost btn-sm"
                            >
                              {coupon.isActive ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              onClick={() => setDialog(coupon)}
                              className="btn btn-ghost p-2"
                              aria-label={`Edit ${coupon.code}`}
                            >
                              <PencilIcon className="size-4" />
                            </button>
                            <button
                              onClick={() => setTarget(coupon)}
                              className="btn btn-ghost p-2 hover:text-danger"
                              aria-label={`Delete ${coupon.code}`}
                            >
                              <Trash2Icon className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* The key rebuilds the form with the values of the coupon that was opened */}
      {dialog && (
        <CouponDialog
          key={dialog === "new" ? "new" : dialog.id}
          coupon={dialog === "new" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      )}

      {target && (
        <ConfirmDialog
          title="Delete this coupon?"
          description={`"${target.code}" will be removed. A coupon that appears on any order cannot be deleted: deactivate it instead.`}
          confirmLabel="Delete coupon"
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(target.id, { onSettled: () => setTarget(null) })}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  );
}