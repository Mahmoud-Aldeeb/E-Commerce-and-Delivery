"use client";

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "@/lib/api";
import deliveryApi from "@/lib/delivery-api";
import { deliveryKeys } from "@/lib/queries/delivery";

export interface CashBalance {
  collected: number;
  settled: number;
  /** What the courier still has to hand over: collected - settled */
  owed: number;
}

export interface CashPartnerRow extends CashBalance {
  id: string;
  name: string;
  phone: string;
  vehicleType: string | null;
  isActive: boolean | null;
  cashOrders: number;
  lastSettledAt: string | null;
}

export interface CashOverview {
  partners: CashPartnerRow[];
  totals: CashBalance;
}

export interface PeriodTotals {
  orders: number;
  collected: number;
  settled: number;
}

export interface DayTotals extends PeriodTotals {
  date: string;
}

export interface WeekTotals extends PeriodTotals {
  weekStart: string;
  weekEnd: string;
}

export interface LedgerOrder {
  id: string;
  number: string;
  total: number;
  deliveredAt: string;
  customer: string;
}

export interface LedgerSettlement {
  id: string;
  amount: number;
  note: string | null;
  settledAt: string;
  /** Set when the admin cancelled this entry: it stays in the history but does not count */
  voidedAt: string | null;
  recordedBy: string | null;
}

export interface PartnerLedger {
  partner: {
    id: string;
    name: string;
    phone: string;
    isActive: boolean | null;
  };
  /** Since ever: it does not depend on the period */
  balance: CashBalance;
  range: { from: string; to: string; timeZone: string };
  totals: PeriodTotals;
  days: DayTotals[];
  weeks: WeekTotals[];
  orders: LedgerOrder[];
  ordersTruncated: boolean;
  settlements: LedgerSettlement[];
}

export interface MyCash {
  balance: CashBalance;
  today: { orders: number; collected: number };
  week: { weekStart: string; orders: number; collected: number };
  settlements: {
    id: string;
    amount: number;
    note: string | null;
    settledAt: string;
  }[];
}

// ["cash"] is the start of every admin key: invalidating it refreshes the overview and every ledger
export const cashKeys = {
  all: ["cash"] as const,
  overview: ["cash", "overview"] as const,
  ledger: (partnerId: string, from: string, to: string) =>
    ["cash", "ledger", partnerId, { from, to }] as const,
};

// The courier's own cash lives under the delivery keys: finishing a delivery refreshes it by itself
export const myCashKey = [...deliveryKeys.all, "cash"] as const;

// ---------- Admin ----------

export const cashOverviewOptions = () =>
  queryOptions({
    queryKey: cashKeys.overview,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<CashOverview>("/admin/cash", { signal });
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

export const partnerLedgerOptions = (
  partnerId: string,
  from: string,
  to: string,
) =>
  queryOptions({
    queryKey: cashKeys.ledger(partnerId, from, to),
    queryFn: async ({ signal }) => {
      const { data } = await api.get<PartnerLedger>(
        `/admin/cash/partners/${partnerId}`,
        {
          // An empty date is not sent: the API then uses its default (the last 7 days)
          params: { from: from || undefined, to: to || undefined },
          signal,
        },
      );
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

export interface SettlementInput {
  amount: number;
  note?: string;
  /** An ISO date. Left out = now */
  settledAt?: string;
}

export function useRecordSettlement(partnerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SettlementInput) => {
      const { data } = await api.post<{ balance: CashBalance }>(
        `/admin/cash/partners/${partnerId}/settlements`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      toast.success("Handover recorded");
      queryClient.invalidateQueries({ queryKey: cashKeys.all });
    },
    // The API says why (for example that the courier owes less than the amount)
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useVoidSettlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/admin/cash/settlements/${id}/void`);
    },
    onSuccess: () => {
      toast.success("Handover cancelled");
      queryClient.invalidateQueries({ queryKey: cashKeys.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// ---------- The courier ----------

export const myCashOptions = () =>
  queryOptions({
    queryKey: myCashKey,
    queryFn: async ({ signal }) => {
      const { data } = await deliveryApi.get<MyCash>("/delivery/my-cash", {
        signal,
      });
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
