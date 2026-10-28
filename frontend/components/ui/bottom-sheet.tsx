"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // While open: Escape closes it, the page behind does not scroll, focus moves inside
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-slide-in-up fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-surface shadow-pop"
      >
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button ref={closeButtonRef} onClick={onClose} className="btn btn-ghost p-2" aria-label={`Close ${title}`}>
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}