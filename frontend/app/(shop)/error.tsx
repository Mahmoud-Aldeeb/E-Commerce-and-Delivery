"use client";

import { TriangleAlertIcon } from "lucide-react";

export default function ShopError({ reset }: { reset: () => void }) {
  return (
    <section className="container-page flex min-h-[50vh] flex-col items-center justify-center text-center">
      <TriangleAlertIcon className="mb-4 size-12 text-warning" />
      <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-ink-soft">
        We couldn&apos;t load this page. Please try again in a moment.
      </p>
      <button onClick={reset} className="btn btn-primary mt-6">
        Try again
      </button>
    </section>
  );
}