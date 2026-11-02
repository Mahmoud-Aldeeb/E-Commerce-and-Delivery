import { BadgeCheckIcon } from "lucide-react";
import RatingStars from "@/components/ui/rating-stars";
import { formatDate } from "@/lib/format";
import type { PublicReview } from "@/lib/queries/reviews";
import { wasEdited } from "@/lib/reviews";

// Every review here is a "verified purchase": the API lets only a customer who
// received the product write one
export default function ReviewCard({ review }: { review: PublicReview }) {
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RatingStars rating={review.rating} />
        <span className="text-sm font-semibold">{review.author}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
          <BadgeCheckIcon className="size-3.5" /> Verified purchase
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {formatDate(review.createdAt)}
        {wasEdited(review) ? " · Edited" : ""}
      </p>
      {review.comment && (
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-ink-soft">
          {review.comment}
        </p>
      )}
    </article>
  );
}