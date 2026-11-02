"use client";

import { useId, useState } from "react";
import { StarIcon } from "lucide-react";

const STARS = [1, 2, 3, 4, 5] as const;
const LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

interface StarInputProps {
  /** 0 = nothing chosen yet */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

// Five real radio buttons: the keyboard (arrows) and screen readers work without extra code.
// The stars only draw them
export default function StarInput({ value, onChange, disabled = false }: StarInputProps) {
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Your rating</legend>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {STARS.map((star) => (
          <label
            key={star}
            onMouseEnter={() => setHover(star)}
            className="cursor-pointer rounded p-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-600/40"
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="sr-only"
              aria-label={`${star} ${star === 1 ? "star" : "stars"}: ${LABELS[star - 1]}`}
            />
            <StarIcon
              className={`size-7 transition-colors ${star <= shown ? "fill-amber-400 text-amber-400" : "text-line-strong"}`}
            />
          </label>
        ))}
        <span className="ml-2 text-sm text-ink-soft" aria-hidden="true">
          {shown > 0 ? LABELS[shown - 1] : "Select a rating"}
        </span>
      </div>
    </fieldset>
  );
}