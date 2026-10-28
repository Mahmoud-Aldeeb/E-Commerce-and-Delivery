"use client";

import Modal from "@/components/ui/modal";

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  tone?: "danger" | "primary";
}

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  isPending = false,
  tone = "danger",
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth="max-w-sm">
      <p className="text-sm text-ink-soft">{description}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onCancel} disabled={isPending} className="btn btn-secondary">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
        >
          {isPending ? "Working..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}