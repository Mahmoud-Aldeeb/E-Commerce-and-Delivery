"use client";

import { queryOptions } from "@tanstack/react-query";
import api from "@/lib/api";

// "wallet" starts every key: invalidating it refreshes the balance everywhere
export const walletKeys = {
  all: ["wallet"] as const,
};

export interface WalletTransaction {
  id: string;
  type: "RETURN_REFUND" | "ORDER_PAYMENT" | "ORDER_REFUND";
  /** + money in, - money out (dollars) */
  amount: number;
  balanceAfter: number;
  orderId: string | null;
  returnId: string | null;
  createdAt: string;
}

export interface WalletOverview {
  balance: number;
  transactions: WalletTransaction[];
  total: number;
  page: number;
  pages: number;
}

export const WALLET_PAGE_SIZE = 10;

// The balance and one page of the history, newest first
export const walletOptions = (page: number) =>
  queryOptions({
    queryKey: [...walletKeys.all, "history", { page }] as const,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<WalletOverview>("/wallet", {
        params: { page, limit: WALLET_PAGE_SIZE },
        signal,
      });
      return data;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

// Only the balance (limit 1 keeps the answer small). The checkout asks it every time it opens,
// and again when the window gets the focus back: the customer may have spent it in another tab
export const walletBalanceOptions = () =>
  queryOptions({
    queryKey: [...walletKeys.all, "balance"] as const,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ balance: number }>("/wallet", {
        params: { limit: 1 },
        signal,
      });
      return data.balance;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
