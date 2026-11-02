"use client";

import { useId, useState } from "react";
import { Loader2Icon } from "lucide-react";
import StarInput from "@/components/reviews/star-input";
import { useSaveReview, type MyReview } from "@/lib/queries/reviews";

const MAX_COMMENT = 1000; // the same limit as the API

interface ReviewFormProps {
  productId: string;
  /** Present = the customer edits his review */
  existing?: MyReview | null;
  onDone?: () => void;
  onCancel?: () => void;
}

export default function ReviewForm({ productId, existing, onDone, onCancel }: ReviewFormProps) {
  const save = useSaveReview(productId);
  const commentId = useId();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (rating < 1) {
      setError("Choose a rating from 1 to 5.");
      return;
    }
    setError(null);
    save.mutate({ rating, comment }, { onSuccess: () => onDone?.() });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <StarInput
          value={rating}
          onChange={(value) => {
            setRating(value);
            setError(null);
          }}
          disabled={save.isPending}
        />
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={commentId} className="field-label">
          Your review (optional)
        </label>
        <textarea
          id={commentId}
          rows={4}
          maxLength={MAX_COMMENT}
          className="input"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What did you like or not like about it?"
          disabled={save.isPending}
        />
        <p className="mt-1 text-right text-xs text-ink-muted">
          {comment.length}/{MAX_COMMENT}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={save.isPending}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
        )}
        <button type="submit" disabled={save.isPending} className="btn btn-primary btn-sm">
          {save.isPending && <Loader2Icon className="size-4 animate-spin" />}
          {existing ? "Save changes" : "Submit review"}
        </button>
      </div>
    </form>
  );
}