"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon } from "lucide-react";
import toast from "react-hot-toast";
import AuthShell from "@/components/auth/auth-shell";
import PasswordInput from "@/components/auth/password-input";
import PageLoader from "@/components/ui/page-loader";
import api, { getErrorMessage } from "@/lib/api";
import { useIsClient } from "@/lib/local-store";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // The token is in the address (?token=...). The address only exists in the browser,
  // so it is read after hydration: no mismatch between the server HTML and the first render
  const isClient = useIsClient();
  const token = isClient ? new URLSearchParams(window.location.search).get("token") : null;

  const reset = useMutation({
    mutationFn: (value: string) => api.post("/auth/reset-password", { token: value, password }),
    onSuccess: () => {
      toast.success("Password updated. Sign in with your new password.");
      router.replace("/login");
    },
  });

  if (!isClient) return <PageLoader />;

  if (!token) {
    return (
      <AuthShell title="This link is not valid" description="The reset link is incomplete.">
        <Link href="/forgot-password" className="btn btn-primary w-full">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <AuthShell title="Choose a new password" description="At least 6 characters.">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirm) return;
          reset.mutate(token);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="new-password" className="field-label">
            New password
          </label>
          <PasswordInput
            id="new-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={6}
          />
        </div>

        <div>
          <label htmlFor="confirm-password" className="field-label">
            Confirm password
          </label>
          <PasswordInput
            id="confirm-password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={6}
          />
          {mismatch && <p className="mt-1 text-xs text-danger">The passwords do not match.</p>}
        </div>

        {reset.isError && (
          <div role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            <p>{getErrorMessage(reset.error)}</p>
            <Link href="/forgot-password" className="mt-1 inline-block font-medium underline">
              Request a new link
            </Link>
          </div>
        )}

        <button
          type="submit"
          disabled={reset.isPending || mismatch}
          className="btn btn-primary btn-lg w-full"
        >
          {reset.isPending && <Loader2Icon className="size-4 animate-spin" />}
          Update password
        </button>
      </form>
    </AuthShell>
  );
}