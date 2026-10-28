"use client";

interface PagerProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  className?: string;
}

// Previous / Next buttons for a list whose page lives in component state.
// (The store catalog uses real links instead: see components/ui/pagination.tsx)
export default function Pager({ page, pages, onChange, className = "" }: PagerProps) {
  if (pages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-3 text-sm ${className}`}>
      <span className="text-ink-muted">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="btn btn-secondary btn-sm"
        >
          Previous
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="btn btn-secondary btn-sm"
        >
          Next
        </button>
      </div>
    </nav>
  );
}