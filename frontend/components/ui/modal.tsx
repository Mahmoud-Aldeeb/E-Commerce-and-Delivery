"use client";

import { useEffect, useId, useRef } from "react";
import { XIcon } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind max-width class of the panel */
  maxWidth?: string;
}

// Rendered only while it is open: the parent decides with a condition
export default function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Always call the latest onClose without re-running the effect below on every render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind does not scroll

    // Move focus inside, unless a field already took it (autoFocus)
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus(); // give focus back to the button that opened it
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      // Only a press on the dark area closes it, not one that started inside the panel
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`animate-fade-in flex max-h-[92vh] w-full ${maxWidth} flex-col rounded-t-2xl bg-surface shadow-pop outline-none sm:rounded-card`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="btn btn-ghost p-2" aria-label="Close">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}