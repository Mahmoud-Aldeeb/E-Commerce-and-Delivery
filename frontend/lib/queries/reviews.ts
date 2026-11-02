"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "@/context/auth-context";
import api, { getErrorMessage } from "@/lib/api";
import { productKeys } from "@/lib/queries/products";

export type Star = 1 | 2 | 3 | 4 | 5;

export interface RatingSummary {
  average: number;
  count: number;
  /** How many reviews gave each star */
  distribution: Record<Star, number>;
}

// What everybody sees: the author is only "First L."
export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  author: string;
}

export interface ProductReviewsPage {
  reviews: PublicReview[];
  total: number;
  page: number;
  pages: number;
  summary: RatingSummary;
}

// What the owner sees of his own review
export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  /** Hidden by the store: only the owner still sees it */
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MyReviewState {
  review: MyReview | null;
  /** The product was delivered to this customer */
  canReview: boolean;
}

export type AdminReviewTab = "all" | "visible" | "hidden";

export interface AdminReview extends MyReview {
  product: { id: string; name: string; image: string };
  user: { name: string; email: string };
}

export interface AdminReviewsPage {
  reviews: AdminReview[];
  total: number;
  page: number;
  pages: number;
  /** One number per tab. They do not depend on the tab that is open */
  counts: Record<AdminReviewTab, number>;
}

export const REVIEWS_PAGE_SIZE = 5;
export const ADMIN_REVIEWS_PAGE_SIZE = 20;

// "reviews" is the start of every key: invalidating it refreshes the public list,
// the owner's review and the admin list together
export const reviewKeys = {
  all: ["reviews"] as const,
  product: (productId: string, page: number) =>
    [...reviewKeys.all, "product", productId, { page }] as const,
  // The user id is part of the key: one customer never sees the cached answer of another
  mine: (userId: string, productId: string) =>
    [...reviewKeys.all, "mine", userId, productId] as const,
  admin: (tab: AdminReviewTab, page: number) =>
    [...reviewKeys.all, "admin", { tab, page }] as const,
};

// Any change to a review also changes the average and the count that sit on the product
function refreshAfterChange(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: reviewKeys.all });
  queryClient.invalidateQueries({ queryKey: productKeys.all });
}

// ---------- Product page ----------

export const productReviewsOptions = (productId: string, page = 1) =>
  queryOptions({
    queryKey: reviewKeys.product(productId, page),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<ProductReviewsPage>(
        `/products/${productId}/reviews`,
        {
          params: { page, limit: REVIEWS_PAGE_SIZE },
          signal,
        },
      );
      return data;
    },
    staleTime: 30_000,
  });

// Only a signed-in customer has a review of his own: for a visitor nothing is asked from the API
export function useMyReviewState(productId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: reviewKeys.mine(user?.id ?? "anonymous", productId),
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<MyReviewState>(
        `/products/${productId}/reviews/me`,
        {
          signal,
        },
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useSaveReview(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { rating: number; comment: string }) => {
      const { data } = await api.put<{ review: MyReview }>(
        `/products/${productId}/reviews`,
        {
          rating: input.rating,
          // An empty comment is simply not sent: the API saves "no comment"
          comment: input.comment.trim() || undefined,
        },
      );
      return data.review;
    },
    onSuccess: () => {
      toast.success("Your review was saved");
      refreshAfterChange(queryClient);
    },
    // The API says why (for example that the product was not delivered to this customer)
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteMyReview(productId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.delete(`/products/${productId}/reviews`);
    },
    onSuccess: () => {
      toast.success("Your review was deleted");
      refreshAfterChange(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// ---------- Admin ----------

export const adminReviewsOptions = (tab: AdminReviewTab, page: number) =>
  queryOptions({
    queryKey: reviewKeys.admin(tab, page),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AdminReviewsPage>("/reviews", {
        params: {
          page,
          limit: ADMIN_REVIEWS_PAGE_SIZE,
          // "all" sends nothing: the API returns every review
          hidden: tab === "all" ? undefined : tab === "hidden",
        },
        signal,
      });
      return data;
    },
    staleTime: 15_000,
  });

export function useSetReviewVisibility() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isHidden }: { id: string; isHidden: boolean }) => {
      await api.put(`/reviews/${id}/visibility`, { isHidden });
    },
    onSuccess: (_result, variables) => {
      toast.success(
        variables.isHidden ? "Review hidden" : "Review shown again",
      );
      refreshAfterChange(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/reviews/${id}`);
    },
    onSuccess: () => {
      toast.success("Review deleted");
      refreshAfterChange(queryClient);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
