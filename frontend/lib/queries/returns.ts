"use client";

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "@/lib/api";
import { adminKeys } from "@/lib/queries/admin";
import { productKeys } from "@/lib/queries/products";
import type { ReturnLine, ReturnReason, ReturnRequest } from "@/types";

// "returns" starts every key: invalidating it refreshes the order pages AND the admin lists
export const returnKeys = {
  all: ["returns"] as const,
  order: (orderId: string) => ["returns", "order", orderId] as const,
  admin: ["returns", "admin"] as const,
};

// ---------- The customer ----------

// What is left of an order line to return
export type ReturnableLine = Omit<ReturnLine, "quantity"> & {
  ordered: number;
  returned: number; // held by returns that are still active
  available: number;
};

export type Eligibility =
  | { eligible: true; windowEndsAt: string }
  | {
      eligible: false;
      code: "NOT_DELIVERED" | "NO_DELIVERY_DATE" | "WINDOW_CLOSED";
      message: string;
      windowEndsAt: string | null;
    };

export interface OrderReturns {
  eligibility: Eligibility;
  windowDays: number;
  lines: ReturnableLine[];
  returnRequests: ReturnRequest[];
}

export const orderReturnsOptions = (orderId: string) =>
  queryOptions({
    queryKey: returnKeys.order(orderId),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<OrderReturns>(
        `/orders/${orderId}/returns`,
        { signal },
      );
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

export interface NewReturn {
  orderId: string;
  items: { product: string; variant?: string | null; quantity: number }[];
  reason: ReturnReason;
  comment?: string;
}

export function useCreateReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, ...body }: NewReturn) => {
      const { data } = await api.post<{ returnRequest: ReturnRequest }>(
        `/orders/${orderId}/returns`,
        body,
      );
      return data.returnRequest;
    },
    onSuccess: () => {
      toast.success("Return requested. The store will answer soon.");
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      // Another return may have taken the units: show what is left now
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}

export function useCancelReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ returnRequest: ReturnRequest }>(
        `/returns/${id}/cancel`,
      );
      return data.returnRequest;
    },
    onSuccess: () => {
      toast.success("Return cancelled");
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}

// ---------- The admin ----------

export type AdminReturnTab =
  | "all"
  | "requested"
  | "approved"
  | "completed"
  | "declined"
  | "refund-failed";

export const ADMIN_RETURNS_PAGE_SIZE = 10;

export interface AdminReturn extends ReturnRequest {
  order: {
    id: string;
    paymentMethod: string;
    total: number;
    deliveredAt: string | null;
    createdAt: string;
  };
  user: { name: string; email: string; phone: string | null };
}

export interface AdminReturnsPage {
  returnRequests: AdminReturn[];
  total: number;
  page: number;
  pages: number;
  /** One number per tab. They ignore the search text */
  counts: Record<AdminReturnTab, number>;
}

export interface AdminReturnsFilters {
  tab: AdminReturnTab;
  search: string;
  page: number;
}

export const adminReturnsOptions = ({
  tab,
  search,
  page,
}: AdminReturnsFilters) =>
  queryOptions({
    queryKey: [...returnKeys.admin, { tab, search, page }] as const,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AdminReturnsPage>("/admin/returns", {
        params: {
          tab,
          search: search || undefined,
          page,
          limit: ADMIN_RETURNS_PAGE_SIZE,
        },
        signal,
      });
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

// Only the numbers of the tabs: the sidebar shows how many returns need the store (limit 1 keeps it small)
export const adminReturnCountsOptions = () =>
  queryOptions({
    queryKey: [...returnKeys.admin, "counts"] as const,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AdminReturnsPage>("/admin/returns", {
        params: { limit: 1 },
        signal,
      });
      return data.counts;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

export function useApproveReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { data } = await api.post<{ returnRequest: AdminReturn }>(
        `/admin/returns/${id}/approve`,
        { note },
      );
      return data.returnRequest;
    },
    onSuccess: () => {
      toast.success("Return approved");
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}

export function useRejectReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { data } = await api.post<{ returnRequest: AdminReturn }>(
        `/admin/returns/${id}/reject`,
        { note },
      );
      return data.returnRequest;
    },
    onSuccess: () => {
      toast.success("Return refused");
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}

export function useCompleteReturn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      restock: boolean;
      cashRefunded?: boolean;
      note?: string;
    }) => {
      const { data } = await api.post<{ returnRequest: AdminReturn }>(
        `/admin/returns/${id}/complete`,
        body,
      );
      return data.returnRequest;
    },
    onSuccess: (returnRequest, variables) => {
      const refundProblem =
        returnRequest.order.paymentMethod === "card" &&
        (returnRequest.refundStatus === null ||
          returnRequest.refundStatus === "failed");

      if (refundProblem) {
        toast.error(
          "The return is completed, but the refund failed. Retry it from the Refund needed tab.",
        );
      } else {
        toast.success("Return completed");
      }
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
      if (variables.restock) {
        // The items went back on the shelves
        queryClient.invalidateQueries({ queryKey: productKeys.all });
        queryClient.invalidateQueries({ queryKey: adminKeys.stats });
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}

export function useRetryReturnRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ returnRequest: AdminReturn }>(
        `/admin/returns/${id}/refund`,
      );
      return data.returnRequest;
    },
    onSuccess: (returnRequest) => {
      if (returnRequest.refundStatus === "refunded")
        toast.success("Refund issued");
      else if (returnRequest.refundStatus === "pending")
        toast.success("Refund is pending");
      else
        toast.error(
          "The refund failed again. Check Stripe and the server log.",
        );
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      queryClient.invalidateQueries({ queryKey: returnKeys.all });
    },
  });
}
