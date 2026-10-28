import { StarIcon } from "lucide-react";

export default function RatingStars({ rating }: { rating: number }) {
  const filled = Math.round(rating);

  return (
    <span
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`Rated ${rating.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          className={`size-4 ${star <= filled ? "fill-amber-400 text-amber-400" : "text-line-strong"}`}
        />
      ))}
    </span>
  );
}