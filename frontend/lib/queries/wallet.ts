"use client";

import { queryOptions } from "@tanstack/react-query";
import api from "@/lib/api";

// "wallet" starts every key: invalidating it refreshes the balance everywhere
export const walletKeys = {
  all: ["wallet"] as const,
};

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
