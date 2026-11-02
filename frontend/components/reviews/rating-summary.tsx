import { StarIcon } from "lucide-react";
import RatingStars from "@/components/ui/rating-stars";
import type { RatingSummary } from "@/lib/queries/reviews";

const ROWS = [5, 4, 3, 2, 1] as const;

export default function RatingSummaryCard({ summary }: { summary: RatingSummary }) {
  if (summary.count === 0) {
    return (
      <div className="card p-5">
        <p className="text-sm font-semibold">No ratings yet</p>
        <p className="mt-1 text-sm text-ink-soft">
          Ratings come from customers who received this product.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold leading-none">{summary.average.toFixed(1)}</span>
        <div>
          <RatingStars rating={summary.average} />
          <p className="mt-1 text-xs text-ink-muted">
            {summary.count} {summary.count === 1 ? "review" : "reviews"}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5" aria-label="Reviews by rating">
        {ROWS.map((star) => {
          const count = summary.distribution[star];
          const percent = (count / summary.count) * 100;
          return (
            <li key={star} className="flex items-center gap-2 text-xs text-ink-soft">
              <span className="flex w-8 shrink-0 items-center gap-0.5">
                {star}
                <StarIcon className="size-3 fill-amber-400 text-amber-400" />
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${percent}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}