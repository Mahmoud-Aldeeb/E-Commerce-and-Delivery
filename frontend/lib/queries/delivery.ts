"use client";

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/api";
import deliveryApi from "@/lib/delivery-api";
import type { Order } from "@/types";

export type DeliveryTab = "active" | "completed";

export const COMPLETED_PAGE_SIZE = 10;

export interface CompletedDeliveriesPage {
  orders: Order[];
  total: number;
  page: number;
  pages: number;
}

export const deliveryKeys = {
  all: ["delivery"] as const,
  active: () => [...deliveryKeys.all, "active"] as const,
  completed: (page: number) =>
    [...deliveryKeys.all, "completed", page] as const,
};

// Active deliveries are always loaded in full: there are few of them, and the
// location sharing needs every one
export const activeDeliveriesOptions = () =>
  queryOptions({
    queryKey: deliveryKeys.active(),
    queryFn: async ({ signal }) => {
      const { data } = await deliveryApi.get<{ orders: Order[] }>(
        "/delivery/my-deliveries",
        {
          params: { status: "active" },
          signal,
        },
      );
      return data.orders;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

// The finished ones only grow, so they come one page at a time
export const completedDeliveriesOptions = (page: number) =>
  queryOptions({
    queryKey: deliveryKeys.completed(page),
    queryFn: async ({ signal }) => {
      const { data } = await deliveryApi.get<CompletedDeliveriesPage>(
        "/delivery/my-deliveries",
        {
          params: { status: "completed", page, limit: COMPLETED_PAGE_SIZE },
          signal,
        },
      );
      return data;
    },
    staleTime: 5_000,
  });

const STATUS_MESSAGES: Record<string, string> = {
  Packed: "Marked as packed",
  "Out for Delivery": "Delivery started",
};

function useRefreshDeliveries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
}

export function useAdvanceDelivery() {
  const refresh = useRefreshDeliveries();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await deliveryApi.put(`/delivery/my-deliveries/${id}/status`, { status });
    },
    onSuccess: (_data, variables) => {
      toast.success(STATUS_MESSAGES[variables.status] ?? "Status updated");
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// No onError toast here: the code dialog shows the error right under the input
export function useCompleteDelivery() {
  const refresh = useRefreshDeliveries();

  return useMutation({
    mutationFn: async ({ id, otp }: { id: string; otp: string }) => {
      await deliveryApi.put(`/delivery/my-deliveries/${id}/complete`, { otp });
    },
    onSuccess: () => {
      toast.success("Delivery completed");
      refresh();
    },
  });
}

export function useCancelDelivery() {
  const refresh = useRefreshDeliveries();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await deliveryApi.put(`/delivery/my-deliveries/${id}/cancel`, { reason });
    },
    onSuccess: () => {
      toast.success("Delivery cancelled");
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
