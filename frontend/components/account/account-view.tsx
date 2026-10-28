"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import toast from "react-hot-toast";
import PasswordInput from "@/components/auth/password-input";
import { useAuth } from "@/context/auth-context";
import api, { getErrorMessage } from "@/lib/api";
import type { User } from "@/types";

function ProfileCard({ user }: { user: User }) {
  // hasPassword is compared with `false` on purpose: a session saved before this field
  // existed has it undefined, and that user must not be told "you have no password"
  const methods: string[] = [];
  if (user.hasPassword !== false) methods.push("Email and password");
  if (user.hasGoogle) methods.push("Google");

  return (
    <section className="card flex items-center gap-4 p-5">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xl font-semibold text-white">
        {user.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="truncate text-sm text-ink-muted">{user.email}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {methods.map((method) => (
            <span key={method} className="badge bg-gray-100 text-gray-700">
              {method}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PhoneForm({ user }: { user: User }) {
  const { updateUser } = useAuth();
  const [phone, setPhone] = useState(user.phone ?? "");

  const save = useMutation({
    mutationFn: async (value: string) => {
      const { data } = await api.patch<{ user: User }>("/auth/me", { phone: value });
      return data.user;
    },
    onSuccess: (saved) => {
      // Only the phone is merged: the saved user keeps its addresses
      updateUser({ phone: saved.phone });
      toast.success("Phone number saved");
    },
  });

  const unchanged = phone.trim() === (user.phone ?? "");

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Phone number</h2>
      <p className="mt-1 text-xs text-ink-muted">
        The courier calls this number. You need it to place an order.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(phone.trim());
        }}
        className="mt-4 flex gap-2"
      >
        <input
          type="tel"
          className="input flex-1"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+20 101 234 5678"
          autoComplete="tel"
          aria-label="Phone number"
          required
        />
        <button type="submit" disabled={save.isPending || unchanged} className="btn btn-primary">
          {save.isPending && <Loader2Icon className="size-4 animate-spin" />}
          Save
        </button>
      </form>

      {save.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {getErrorMessage(save.error)}
        </p>
      )}
    </section>
  );
}

function PasswordCard({ user }: { user: User }) {
  const { setPassword } = useAuth();
  const [password, setPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");

  const add = useMutation({
    mutationFn: () => setPassword(password),
    onSuccess: () => {
      setPasswordValue("");
      setConfirm("");
      toast.success("Password added. You can now also sign in with your email.");
    },
  });

  // A password already exists: changing it goes through the emailed link, which also
  // proves the person owns the email
  if (user.hasPassword !== false) {
    return (
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Password</h2>
        <p className="mt-1 text-sm text-ink-soft">
          You can sign in with your email and password. To change it, we will email you a link.
        </p>
        <Link href="/forgot-password" className="btn btn-secondary btn-sm mt-3">
          Change password
        </Link>
      </section>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold">Add a password</h2>
      <p className="mt-1 text-sm text-ink-soft">
        You sign in with Google. Add a password to also sign in with your email.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (password !== confirm) return;
          add.mutate();
        }}
        className="mt-4 space-y-4"
      >
        <div>
          <label htmlFor="account-password" className="field-label">
            New password
          </label>
          <PasswordInput
            id="account-password"
            value={password}
            onChange={setPasswordValue}
            autoComplete="new-password"
            minLength={6}
          />
        </div>

        <div>
          <label htmlFor="account-confirm" className="field-label">
            Confirm password
          </label>
          <PasswordInput
            id="account-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            minLength={6}
          />
          {mismatch && <p className="mt-1 text-xs text-danger">The passwords do not match.</p>}
        </div>

        {add.isError && (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
            {getErrorMessage(add.error)}
          </p>
        )}

        <button type="submit" disabled={add.isPending || mismatch} className="btn btn-primary">
          {add.isPending && <Loader2Icon className="size-4 animate-spin" />}
          Add password
        </button>
      </form>
    </section>
  );
}

export default function AccountView() {
  const { user, logout } = useAuth();

  // RequireAuth does not render this page without a user: this only satisfies the types
  if (!user) return null;

  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-bold tracking-tight">My account</h1>

      <div className="mt-6 space-y-6">
        <ProfileCard user={user} />
        <PhoneForm user={user} />
        <PasswordCard user={user} />

        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex gap-4 text-sm font-medium text-primary-700">
            <Link href="/orders" className="hover:text-primary-800">
              My orders
            </Link>
            <Link href="/addresses" className="hover:text-primary-800">
              Addresses
            </Link>
          </div>
          <button onClick={logout} className="btn btn-secondary btn-sm hover:text-danger">
            <LogOutIcon className="size-4" /> Sign out
          </button>
        </section>
      </div>
    </div>
  );
}