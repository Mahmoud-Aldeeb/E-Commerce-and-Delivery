"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { StarIcon, TriangleAlertIcon } from "lucide-react";
import MyReviewPanel from "@/components/reviews/my-review-panel";
import RatingSummaryCard from "@/components/reviews/rating-summary";
import ReviewCard from "@/components/reviews/review-card";
import EmptyState from "@/components/ui/empty-state";
import Pager from "@/components/ui/pager";
import { productReviewsOptions } from "@/lib/queries/reviews";

interface ReviewsSectionProps {
  productId: string;
  productName: string;
}

export default function ReviewsSection({ productId, productName }: ReviewsSectionProps) {
  const [page, setPage] = useState(1);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...productReviewsOptions(productId, page),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  const reviews = data?.reviews ?? [];
  // There are reviews, but the requested page is past the last one (for example after a delete)
  const pastLastPage = Boolean(data && reviews.length === 0 && data.total > 0);

  function goToPage(next: number) {
    setPage(next);
    document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    // scroll-mt: the sticky header must not cover the title when a link jumps here (#reviews)
    <section id="reviews" aria-labelledby="reviews-heading" className="mt-14 scroll-mt-32">
      <h2 id="reviews-heading" className="mb-5 text-xl font-semibold tracking-tight sm:text-2xl">
        Customer reviews
      </h2>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          {data ? (
            <RatingSummaryCard summary={data.summary} />
          ) : isPending ? (
            <div className="skeleton h-48 w-full" aria-busy="true" />
          ) : null}
          <MyReviewPanel productId={productId} productName={productName} />
        </div>

        <div className="lg:col-span-2">
          {isPending ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((item) => (
                <div key={item} className="card space-y-3 p-5">
                  <div className="skeleton h-4 w-40" />
                  <div className="skeleton h-4 w-full" />
                  <div className="skeleton h-4 w-2/3" />
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
            <EmptyState
              icon={StarIcon}
              title="No reviews yet"
              description="Reviews appear here after customers receive this product."
            />
          ) : (
            <>
              <ul className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                {reviews.map((review) => (
                  <li key={review.id}>
                    <ReviewCard review={review} />
                  </li>
                ))}
              </ul>
              {data && <Pager page={data.page} pages={data.pages} onChange={goToPage} className="mt-6" />}
            </>
          )}
        </div>
      </div>
    </section>
  );
}