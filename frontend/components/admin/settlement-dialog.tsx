"use client";

import { useState } from "react";
import Field from "@/components/admin/field";
import Modal from "@/components/ui/modal";
import { fromLocalInput } from "@/lib/coupons";
import { formatPrice } from "@/lib/format";
import { useRecordSettlement } from "@/lib/queries/cash";

const FUTURE_TOLERANCE_MS = 5 * 60_000; // the same as the API: two clocks never agree exactly

type Errors = Partial<Record<"amount" | "note" | "settledAt", string>>;

const hasMoreThanTwoDecimals = (value: number) => Math.round(value * 100) / 100 !== value;

interface SettlementDialogProps {
  partnerId: string;
  partnerName: string;
  /** What the courier still owes: he cannot hand over more than this */
  owed: number;
  onClose: () => void;
}

export default function SettlementDialog({ partnerId, partnerName, owed, onClose }: SettlementDialogProps) {
  const record = useRecordSettlement(partnerId);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [settledAt, setSettledAt] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const clear = (key: keyof Errors) => setErrors((current) => ({ ...current, [key]: undefined }));

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Errors = {};

    const value = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(value) || value <= 0) {
      found.amount = "Enter an amount above 0.";
    } else if (hasMoreThanTwoDecimals(value)) {
      found.amount = "Use at most 2 decimals.";
    } else if (Math.round(value * 100) > Math.round(owed * 100)) {
      found.amount = `${partnerName} owes ${formatPrice(owed)}. You cannot record more than that.`;
    }

    if (note.trim().length > 200) found.note = "The note must be 200 characters or fewer.";

    // Empty = now. The time of the device of the admin is used
    const when = fromLocalInput(settledAt);
    if (when && new Date(when).getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      found.settledAt = "The date cannot be in the future.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    record.mutate(
      { amount: value, note: note.trim() || undefined, settledAt: when ?? undefined },
      { onSuccess: onClose },
    );
  }

  return (
    <Modal title="Record a handover" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-ink-soft">
          Money <strong>{partnerName}</strong> handed over to the store. He still owes{" "}
          <strong>{formatPrice(owed)}</strong>.
        </p>

        <Field id="settlement-amount" label="Amount ($)" error={errors.amount}>
          <input
            id="settlement-amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className={`input ${errors.amount ? "input-error" : ""}`}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              clear("amount");
            }}
            autoFocus
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "settlement-amount-error" : undefined}
          />
          <button
            type="button"
            onClick={() => {
              setAmount(String(owed));
              clear("amount");
            }}
            className="mt-1 text-xs font-medium text-primary-700 hover:underline"
          >
            The full amount ({formatPrice(owed)})
          </button>
        </Field>

        <Field id="settlement-note" label="Note" error={errors.note} hint="Optional, for example how it was handed over.">
          <input
            id="settlement-note"
            className={`input ${errors.note ? "input-error" : ""}`}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              clear("note");
            }}
            maxLength={200}
            aria-invalid={Boolean(errors.note)}
            aria-describedby={errors.note ? "settlement-note-error" : undefined}
          />
        </Field>

        <Field
          id="settlement-date"
          label="When was it handed over?"
          error={errors.settledAt}
          hint="Optional. Empty = now. Use it when you record yesterday's handover today."
        >
          <input
            id="settlement-date"
            type="datetime-local"
            className={`input ${errors.settledAt ? "input-error" : ""}`}
            value={settledAt}
            onChange={(event) => {
              setSettledAt(event.target.value);
              clear("settledAt");
            }}
            aria-invalid={Boolean(errors.settledAt)}
            aria-describedby={errors.settledAt ? "settlement-date-error" : undefined}
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={record.isPending} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={record.isPending} className="btn btn-primary">
            {record.isPending ? "Saving..." : "Record handover"}
          </button>
        </div>
      </form>
    </Modal>
  );
}