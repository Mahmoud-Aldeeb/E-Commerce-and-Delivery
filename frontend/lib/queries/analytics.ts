"use client";

import { queryOptions } from "@tanstack/react-query";
import api from "@/lib/api";
import { adminKeys } from "@/lib/queries/admin";

export type AnalyticsPeriod = 7 | 30 | 90;

export const ANALYTICS_PERIODS: { days: AnalyticsPeriod; label: string }[] = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export interface DailySales {
  date: string; // a day of the store, like "2026-11-01"
  orders: number;
  revenue: number;
  discount: number;
}

export interface BestSeller {
  productId: string;
  name: string;
  image: string;
  units: number;
  revenue: number;
  orders: number;
  /** The stock today. null = the product is gone, or its stock is not tracked */
  stock: number | null;
}

export interface CancelledProduct {
  productId: string;
  name: string;
  image: string;
  cancelledOrders: number;
  cancelledUnits: number;
  orderedUnits: number;
  /** The share of the ordered units that was cancelled, in whole percent */
  cancelRate: number;
  flagged: boolean;
}

export interface LowStockProduct {
  id: string;
  name: string;
  image: string;
  stock: number;
  soldInPeriod: number;
  /** How many days the stock lasts at the pace of the period. null = nothing was sold */
  daysLeft: number | null;
}

export type RefundKind = "missing" | "failed" | "pending";

export interface RefundItem {
  id: string;
  number: string;
  customer: string;
  email: string;
  total: number;
  kind: RefundKind;
  since: string;
  paymentIntentId: string | null;
}

export interface MoneyCount {
  count: number;
  amount: number;
}

export interface Analytics {
  range: { from: string; to: string; days: number; timeZone: string };
  /** true = there are more orders than one report reads: the numbers are partial */
  truncated: boolean;
  summary: {
    orders: number;
    revenue: number;
    discount: number;
    averageOrder: number;
    bestDay: { date: string; revenue: number } | null;
    cancelledOrders: number;
    cancelRate: number;
  };
  previous: { orders: number; revenue: number };
  /** Whole percent against the days before. null = there was nothing before */
  change: { orders: number | null; revenue: number | null };
  days: DailySales[];
  bestSellers: BestSeller[];
  cancelledProducts: CancelledProduct[];
  lowStock: {
    counts: { low: number; out: number };
    products: LowStockProduct[];
  };
  refunds: {
    needsAction: MoneyCount;
    stalePending: MoneyCount;
    staleAfterDays: number;
    items: RefundItem[];
  };
}

export const analyticsOptions = (days: AnalyticsPeriod) =>
  queryOptions({
    queryKey: [...adminKeys.analytics, { days }] as const,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<Analytics>("/admin/analytics", {
        params: { days },
        signal,
      });
      return data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
