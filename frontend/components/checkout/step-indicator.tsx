"use client";

import { CheckIcon } from "lucide-react";

export type Step = "address" | "payment" | "review";

const STEPS: { key: Step; label: string }[] = [
  { key: "address", label: "Address" },
  { key: "payment", label: "Payment" },
  { key: "review", label: "Review" },
];

interface StepIndicatorProps {
  current: Step;
  /** A step can be opened only when everything before it is complete */
  reachable: Record<Step, boolean>;
  onSelect: (step: Step) => void;
}

export default function StepIndicator({ current, reachable, onSelect }: StepIndicatorProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Checkout steps">
      {STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isDone = index < currentIndex;

        return (
          <li key={step.key} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              onClick={() => onSelect(step.key)}
              disabled={!reachable[step.key]}
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-center gap-2 rounded-control py-1 pr-1 text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              <span
                className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${isCurrent || isDone
                    ? "bg-primary-700 text-white"
                    : "bg-line text-ink-muted"
                  }`}
              >
                {isDone ? <CheckIcon className="size-4" /> : index + 1}
              </span>
              <span className={isCurrent ? "text-ink" : "text-ink-muted"}>{step.label}</span>
            </button>
            {index < STEPS.length - 1 && (
              <span className={`h-px flex-1 ${isDone ? "bg-primary-700" : "bg-line"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}