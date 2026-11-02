import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

export function InfoPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {updated && <p className="mt-1 text-sm text-ink-muted">Last updated: {updated}</p>}
      {intro && <p className="mt-4 text-ink-soft">{intro}</p>}
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function InfoList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

// Says out loud that this is a demonstration. Delete it (and its use on the two legal pages)
// the day the store takes real orders
export function DemoNotice() {
  return (
    <div
      role="note"
      className="rounded-card border border-primary-100 bg-primary-50 p-4 text-sm text-primary-800"
    >
      <strong>Demo store.</strong> This store is a portfolio project. The policies below describe how
      it is designed to work: no real orders are fulfilled and card payments use the test mode of
      Stripe.
    </div>
  );
}

// One question of the FAQ: a native details element (it works without JavaScript)
export function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group card p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <ChevronDownIcon className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </details>
  );
}