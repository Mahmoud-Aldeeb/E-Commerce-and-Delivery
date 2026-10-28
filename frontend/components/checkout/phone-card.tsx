"use client";

import { useState } from "react";
import { PhoneIcon } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api";
import { useSavePhone } from "@/lib/queries/profile";

// The same rule as the API (UpdateProfileDto): the server has the last word
const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{5,18}[0-9]$/;

export default function PhoneCard() {
  const { user } = useAuth();
  const save = useSavePhone();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const phone = user?.phone;
  // Nothing saved yet: the form is the only thing to show
  const showForm = editing || !phone;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = value.trim();
    if (!PHONE_PATTERN.test(trimmed)) {
      setError("Enter a valid phone number, for example +20 101 234 5678.");
      return;
    }

    setError(null);
    save.mutate(trimmed, { onSuccess: () => setEditing(false) });
  }

  if (!showForm) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-canvas p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <PhoneIcon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Contact phone</p>
            <p className="text-sm text-ink-soft">{phone}</p>
          </div>
        </div>
        <button
          onClick={() => {
            setValue(phone ?? "");
            setError(null);
            setEditing(true);
          }}
          className="text-sm font-medium text-primary-700 hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  const message = error ?? (save.isError ? getErrorMessage(save.error) : null);

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-card border border-line bg-canvas p-4">
      <label htmlFor="contact-phone" className="field-label">
        Contact phone
      </label>
      <p className="mb-2 text-xs text-ink-muted">
        The courier calls this number when your order is on its way.
      </p>
      <input
        id="contact-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
          if (save.isError) save.reset();
        }}
        placeholder="+20 101 234 5678"
        className={`input ${message ? "input-error" : ""}`}
        aria-invalid={Boolean(message)}
        aria-describedby={message ? "contact-phone-error" : undefined}
      />
      {message && (
        <p id="contact-phone-error" role="alert" className="field-error">
          {message}
        </p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        {phone && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
              save.reset();
            }}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
        )}
        <button type="submit" disabled={save.isPending} className="btn btn-primary btn-sm">
          {save.isPending ? "Saving..." : "Save number"}
        </button>
      </div>
    </form>
  );
}