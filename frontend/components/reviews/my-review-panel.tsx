"use client";

import { useState } from "react";
import Link from "next/link";
import { PencilIcon, Trash2Icon } from "lucide-react";
import ReviewForm from "@/components/reviews/review-form";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import RatingStars from "@/components/ui/rating-stars";
import { useAuth } from "@/context/auth-context";
import { formatDate } from "@/lib/format";
import { useDeleteMyReview, useMyReviewState } from "@/lib/queries/reviews";

interface MyReviewPanelProps {
  productId: string;
  productName: string;
}

export default function MyReviewPanel({ productId, productName }: MyReviewPanelProps) {
  const { user, isReady } = useAuth();
  const state = useMyReviewState(productId);
  const remove = useDeleteMyReview(productId);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Until the saved session is read, nobody is told to sign in
  if (!isReady) return <div className="skeleton h-28 w-full" aria-busy="true" />;

  if (!user) {
    // The login page brings the customer back to the reviews of this product
    const redirect = encodeURIComponent(`/products/${productId}#reviews`);
    return (
      <div className="card p-5">
        <h3 className="text-sm font-semibold">Write a review</h3>
        <p className="mt-1 text-sm text-ink-soft">
          Sign in to review a product you received.
        </p>
        <Link href={`/login?redirect=${redirect}`} className="btn btn-secondary btn-sm mt-3">
          Sign in
        </Link>
      </div>
    );
  }

  if (state.isPending) return <div className="skeleton h-28 w-full" aria-busy="true" />;

  if (state.isError) {
    return (
      <div className="card p-5">
        <p className="text-sm text-ink-soft">We couldn&apos;t check your review of this product.</p>
        <button onClick={() => state.refetch()} className="btn btn-secondary btn-sm mt-3">
          Try again
        </button>
      </div>
    );
  }

  const { review, canReview } = state.data;

  if (review) {
    if (editing) {
      return (
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Edit your review</h3>
          <ReviewForm
            productId={productId}
            existing={review}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      );
    }

    return (
      <div className="card p-5">
        <h3 className="text-sm font-semibold">Your review</h3>
        <div className="mt-2">
          <RatingStars rating={review.rating} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">{formatDate(review.createdAt)}</p>
        {review.comment && (
          <p className="mt-3 whitespace-pre-line break-words text-sm text-ink-soft">
            {review.comment}
          </p>
        )}
        {review.isHidden && (
          <p role="status" className="mt-3 rounded-control bg-canvas px-3 py-2 text-xs text-ink-soft">
            The store hid this review. Only you can see it.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">
            <PencilIcon className="size-4" /> Edit
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="btn btn-ghost btn-sm hover:text-danger"
          >
            <Trash2Icon className="size-4" /> Delete
          </button>
        </div>

        {confirmingDelete && (
          <ConfirmDialog
            title="Delete your review?"
            description="Your review will be removed from this product. You can write a new one later."
            confirmLabel="Delete review"
            isPending={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSettled: () => setConfirmingDelete(false) })}
            onCancel={() => setConfirmingDelete(false)}
          />
        )}
      </div>
    );
  }

  if (canReview) {
    return (
      <div className="card p-5">
        <h3 className="mb-4 text-sm font-semibold">How was {productName}?</h3>
        <ReviewForm productId={productId} />
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold">Write a review</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Only customers who received this product can review it. This keeps every review honest.
      </p>
    </div>
  );
}