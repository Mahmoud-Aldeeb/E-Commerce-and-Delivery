"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, MailIcon } from "lucide-react";
import AuthShell from "@/components/auth/auth-shell";
import api, { getErrorMessage } from "@/lib/api";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");

  const request = useMutation({
    mutationFn: (value: string) => api.post("/auth/forgot-password", { email: value }),
  });

  // The API answers the same way for every email, so this text never says "we found you"
  if (request.isSuccess) {
    return (
      <AuthShell title="Check your email">
        <div className="flex items-start gap-3 rounded-control bg-canvas p-3 text-sm text-ink-soft">
          <MailIcon className="mt-0.5 size-4 shrink-0 text-primary-700" />
          <p>
            If an account exists for <span className="font-medium text-ink">{email.trim()}</span>, we
            sent a link to choose a new password. It works for 1 hour. Check your spam folder too.
          </p>
        </div>
        <button onClick={() => request.reset()} className="btn btn-secondary mt-4 w-full">
          Use a different email
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter your email and we will send you a link to choose a new one. It also works for accounts that use Google."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate(email.trim());
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        {request.isError && (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {getErrorMessage(request.error)}
          </p>
        )}

        <button type="submit" disabled={request.isPending} className="btn btn-primary btn-lg w-full">
          {request.isPending && <Loader2Icon className="size-4 animate-spin" />}
          Send reset link
        </button>
      </form>
    </AuthShell>
  );
}