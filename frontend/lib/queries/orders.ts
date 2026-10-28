"use client";

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "@/lib/api";
import { productKeys } from "@/lib/queries/products";
import type { Order } from "@/types";

export type OrderTab = "all" | "active" | "delivered" | "cancelled";

export interface OrderCounts {
  all: number;
  active: number;
  delivered: number;
  cancelled: number;
}

export interface OrdersPage {
  orders: Order[];
  total: number;
  page: number;
  pages: number;
  /** One number per tab. They do not depend on the tab that is open */
  counts: OrderCounts;
}

export const ORDERS_PAGE_SIZE = 10;

// "orders" is the root key the checkout invalidates after a new order
export const orderKeys = {
  all: ["orders"] as const,
  list: (tab: OrderTab, page: number) =>
    [...orderKeys.all, "list", { tab, page }] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
};

export const ordersOptions = (tab: OrderTab = "all", page = 1) =>
  queryOptions({
    queryKey: orderKeys.list(tab, page),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<OrdersPage>("/orders", {
        params: { status: tab, page, limit: ORDERS_PAGE_SIZE },
        signal,
      });
      return data;
    },
    staleTime: 15_000,
    // Coming back to the tab refreshes the statuses
    refetchOnWindowFocus: true,
  });

export const orderDetailOptions = (id: string) =>
  queryOptions({
    queryKey: orderKeys.detail(id),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ order: Order }>(`/orders/${id}`, {
        signal,
      });
      return data.order;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

// What happened to the money: none = nothing was paid online
export type RefundOutcome = "none" | "refunded" | "pending" | "failed";

const CANCEL_MESSAGES: Record<RefundOutcome, string> = {
  none: "Your order was cancelled.",
  refunded: "Your order was cancelled and the refund was issued.",
  pending: "Your order was cancelled. The refund is on its way.",
  failed: "Your order was cancelled. We will complete your refund shortly.",
};

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data } = await api.post<{ order: Order; refund: RefundOutcome }>(
        `/orders/${id}/cancel`,
        { reason },
      );
      return data;
    },
    onSuccess: ({ refund }) => {
      toast.success(CANCEL_MESSAGES[refund]);
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      // The items went back to stock
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
