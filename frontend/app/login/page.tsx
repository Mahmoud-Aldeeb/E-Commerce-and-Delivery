"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import toast from "react-hot-toast";
import Logo from "@/components/layout/logo";
import PageLoader from "@/components/ui/page-loader";
import { siteConfig } from "@/config/site";
import { useAuth } from "@/context/auth-context";
import { getErrorMessage } from "@/lib/api";

type Mode = "login" | "register";

// Inlined at build time. Without it the Google button is simply not shown
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// Only follow redirects to pages of this site (this blocks https://evil.com and //evil.com),
// and never send the user back to the login page itself
function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/";
  }
  return value;
}

const readRedirect = () =>
  safeRedirect(new URLSearchParams(window.location.search).get("redirect"));

export default function LoginPage() {
  const router = useRouter();
  const { user, login, register, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);

  // As soon as there is a signed-in user (after the form, or if they were already
  // signed in) leave this page
  useEffect(() => {
    if (user) router.replace(readRedirect());
  }, [user, router]);

  const auth = useMutation({
    mutationFn: () =>
      mode === "login"
        ? login(form.email.trim(), form.password)
        : register(form.name.trim(), form.email.trim(), form.password),
    onSuccess: () => toast.success(mode === "login" ? "Welcome back!" : "Your account is ready"),
  });

  const googleAuth = useMutation({
    mutationFn: (idToken: string) => loginWithGoogle(idToken),
    onSuccess: ({ passwordRemoved }) => {
      toast.success("Welcome!");
      // The user must know why the old password stopped working
      if (passwordRemoved) {
        toast(
          "Your account is now linked to Google, and your old password was removed. You can set a new one from My account.",
          { id: "password-removed", duration: 8000 },
        );
      }
    },
  });

  if (user) return <PageLoader />;

  const isRegister = mode === "register";
  const busy = auth.isPending || googleAuth.isPending;
  // Only one of the two can have failed at a time: each new attempt resets the other
  const failure = auth.isError ? auth.error : googleAuth.isError ? googleAuth.error : null;

  function switchMode(next: Mode) {
    setMode(next);
    auth.reset(); // the error of one form does not belong to the other
    googleAuth.reset();
  }

  const setField = (name: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-ink-soft">{siteConfig.tagline}</p>
        </div>

        <div className="card p-6">
          {/* Sign in / Create account */}
          <div
            className="mb-6 grid grid-cols-2 rounded-control bg-canvas p-1"
            role="group"
            aria-label="Sign in or create an account"
          >
            {(["login", "register"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => switchMode(option)}
                aria-pressed={mode === option}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${mode === option
                  ? "bg-surface text-ink shadow-card"
                  : "text-ink-muted hover:text-ink"
                  }`}
              >
                {option === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <h1 className="mb-1 text-xl font-semibold">
            {isRegister ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mb-5 text-sm text-ink-soft">
            {isRegister
              ? "Track your orders live and check out faster."
              : "Sign in to continue to your account."}
          </p>

          {GOOGLE_CLIENT_ID && (
            <>
              {/* The provider lives here, not in providers.tsx: Google's script loads only on this page */}
              <div className={`flex justify-center ${busy ? "pointer-events-none opacity-60" : ""}`}>
                <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                  <GoogleLogin
                    text={isRegister ? "signup_with" : "signin_with"}
                    shape="rectangular"
                    onSuccess={(response) => {
                      auth.reset();
                      if (response.credential) googleAuth.mutate(response.credential);
                    }}
                    onError={() => toast.error("Google sign-in failed. Please try again.")}
                  />
                </GoogleOAuthProvider>
              </div>

              <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
                <span className="h-px flex-1 bg-line" />
                or
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              googleAuth.reset();
              auth.mutate();
            }}
            className="space-y-4"
          >
            {isRegister && (
              <div>
                <label htmlFor="name" className="field-label">
                  Full name
                </label>
                <input
                  id="name"
                  className="input"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="input"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="field-label">
                  Password
                </label>
                {!isRegister && (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-primary-700 transition-colors hover:text-primary-800"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input pr-11"
                  value={form.password}
                  onChange={(event) => setField("password", event.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={isRegister ? 6 : undefined}
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
              {isRegister && <p className="mt-1 text-xs text-ink-muted">At least 6 characters.</p>}
            </div>

            {failure && (
              <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
                {getErrorMessage(failure)}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
              {busy && <Loader2Icon className="size-4 animate-spin" />}
              {isRegister ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        <Link
          href="/"
          className="mt-6 flex items-center justify-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeftIcon className="size-4" /> Back to the store
        </Link>
      </div>
    </main>
  );
}