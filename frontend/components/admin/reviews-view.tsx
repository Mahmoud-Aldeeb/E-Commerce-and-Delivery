"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, StarIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import PageHeader from "@/components/admin/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import Pager from "@/components/ui/pager";
import RatingStars from "@/components/ui/rating-stars";
import { formatDateTime } from "@/lib/format";
import {
  adminReviewsOptions,
  useDeleteReview,
  useSetReviewVisibility,
  type AdminReview,
  type AdminReviewTab,
} from "@/lib/queries/reviews";

const TABS: { key: AdminReviewTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "visible", label: "Visible" },
  { key: "hidden", label: "Hidden" },
];

const EMPTY: Record<AdminReviewTab, string> = {
  all: "No reviews yet. They appear here when customers review the products they received.",
  visible: "No visible reviews.",
  hidden: "No hidden reviews.",
};

export default function ReviewsView() {
  const [tab, setTab] = useState<AdminReviewTab>("all");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminReview | null>(null);

  const setVisibility = useSetReviewVisibility();
  const remove = useDeleteReview();

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...adminReviewsOptions(tab, page),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  const reviews = data?.reviews ?? [];
  // There are reviews, but the requested page is past the last one (for example after a delete)
  const pastLastPage = Boolean(data && reviews.length === 0 && data.total > 0);

  function changeTab(next: AdminReviewTab) {
    setTab(next);
    setPage(1); // a new filter starts again from the first page
  }

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Only customers who received a product can review it. Hide or delete a review that breaks the rules."
      />

      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter reviews">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => changeTab(item.key)}
            aria-pressed={tab === item.key}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === item.key
              ? "bg-primary-700 text-white"
              : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
              }`}
          >
            {item.label}
            {data && <span className="ml-1.5 opacity-70">{data.counts[item.key]}</span>}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="card space-y-3 p-4">
              <div className="skeleton h-11 w-64" />
              <div className="skeleton h-4 w-full" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the reviews"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : pastLastPage ? (
        <EmptyState
          icon={StarIcon}
          title="There is nothing on this page"
          action={
            <button onClick={() => setPage(1)} className="btn btn-secondary">
              Go to the first page
            </button>
          }
        />
      ) : reviews.length === 0 ? (
        <EmptyState icon={StarIcon} title={EMPTY[tab]} />
      ) : (
        <>
          <ul className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
            {reviews.map((review) => (
              <li key={review.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Image
                      src={review.product.image}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 shrink-0 rounded-control bg-canvas object-cover"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/products/${review.product.id}#reviews`}
                        className="block max-w-64 truncate text-sm font-medium hover:text-primary-700"
                      >
                        {review.product.name}
                      </Link>
                      <p className="truncate text-xs text-ink-muted">
                        {review.user.name} · {review.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RatingStars rating={review.rating} />
                    <span className={`badge ${review.isHidden ? "badge-warning" : "badge-success"}`}>
                      {review.isHidden ? "Hidden" : "Visible"}
                    </span>
                  </div>
                </div>

                {review.comment ? (
                  <p className="mt-3 whitespace-pre-line break-words text-sm text-ink-soft">
                    {review.comment}
                  </p>
                ) : (
                  <p className="mt-3 text-sm italic text-ink-muted">No comment</p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-ink-muted">{formatDateTime(review.createdAt)}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() =>
                        setVisibility.mutate({ id: review.id, isHidden: !review.isHidden })
                      }
                      disabled={setVisibility.isPending}
                      className="btn btn-ghost btn-sm"
                    >
                      {review.isHidden ? (
                        <>
                          <EyeIcon className="size-4" /> Show
                        </>
                      ) : (
                        <>
                          <EyeOffIcon className="size-4" /> Hide
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setTarget(review)}
                      className="btn btn-ghost btn-sm hover:text-danger"
                    >
                      <Trash2Icon className="size-4" /> Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {data && <Pager page={data.page} pages={data.pages} onChange={setPage} className="mt-6" />}
        </>
      )}

      {target && (
        <ConfirmDialog
          title="Delete this review?"
          description={`The review of ${target.user.name} on "${target.product.name}" will be removed for good. To keep it but stop showing it, hide it instead.`}
          confirmLabel="Delete review"
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(target.id, { onSettled: () => setTarget(null) })}
          onCancel={() => setTarget(null)}
        />
      )}
    </>
  );
}
