"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import toast from "react-hot-toast";
import Logo from "@/components/layout/logo";
import PageLoader from "@/components/ui/page-loader";
import { useDeliveryAuth } from "@/context/delivery-auth-context";
import { getErrorMessage } from "@/lib/api";

const REASONS: Record<string, string> = {
  expired: "Your session expired. Please sign in again.",
  blocked: "This account can no longer use the delivery portal. Please contact the store.",
};

export default function DeliveryLoginView() {
  const router = useRouter();
  const reason = useSearchParams().get("reason");
  const { partner, login } = useDeliveryAuth();

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  // Already signed in (or just signed in): go to the portal
  useEffect(() => {
    if (partner) router.replace("/delivery");
  }, [partner, router]);

  const signIn = useMutation({
    mutationFn: () => login(form.email.trim(), form.password),
    onSuccess: () => toast.success("Signed in"),
  });

  if (partner) return <PageLoader />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-ink-soft">Delivery partner portal</p>
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mb-5 mt-1 text-sm text-ink-soft">Use the account the store gave you.</p>

          {reason && REASONS[reason] && !signIn.isError && (
            <p role="status" className="mb-4 rounded-control bg-warning-soft px-3 py-2 text-sm text-warning">
              {REASONS[reason]}
            </p>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              signIn.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="partner-email" className="field-label">
                Email
              </label>
              <input
                id="partner-email"
                type="email"
                className="input"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="partner@example.com"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="partner-password" className="field-label">
                Password
              </label>
              <div className="relative">
                <input
                  id="partner-password"
                  type={showPassword ? "text" : "password"}
                  className="input pr-11"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-2 text-ink-muted transition-colors hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                </button>
              </div>
            </div>

            {signIn.isError && (
              <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                {getErrorMessage(signIn.error)}
              </p>
            )}

            <button type="submit" disabled={signIn.isPending} className="btn btn-primary btn-lg w-full">
              {signIn.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Sign in
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}