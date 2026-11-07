"use client";

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "@/lib/api";
import type { CartItem } from "@/types";

export type CouponKind = "PERCENT" | "FIXED";

export interface AdminCoupon {
  id: string;
  code: string;
  type: CouponKind;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  isActive: boolean;
  /** Orders that hold a use of it (not cancelled, and paid when by card) */
  redeemedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponTotals {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  tax: number;
  total: number;
}

export interface CouponCheckResponse {
  coupon: { code: string; type: CouponKind; value: number };
  totals: CouponTotals;
}

// ["coupons"] is the start of every key: invalidating it refreshes the admin list AND the checks
export const couponKeys = {
  all: ["coupons"] as const,
  list: ["coupons", "list"] as const,
  check: (code: string | null, items: string) =>
    ["coupons", "check", code, items] as const,
};

// ---------- Admin ----------

export const adminCouponsOptions = () =>
  queryOptions({
    queryKey: couponKeys.list,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ coupons: AdminCoupon[] }>("/coupons", {
        signal,
      });
      return data.coupons;
    },
  });

export interface CouponFields {
  type: CouponKind;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  isActive: boolean;
}

// id present = update (only what is sent changes), absent = create (the code is sent too)
export type SaveCouponVariables = Partial<CouponFields> & {
  id?: string;
  code?: string;
};

export function useSaveCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: SaveCouponVariables) => {
      const { data } = id
        ? await api.put<{ coupon: AdminCoupon }>(`/coupons/${id}`, body)
        : await api.post<{ coupon: AdminCoupon }>("/coupons", body);
      return data.coupon;
    },
    onSuccess: (_coupon, variables) => {
      toast.success(variables.id ? "Coupon updated" : "Coupon created");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/coupons/${id}`);
    },
    onSuccess: () => {
      toast.success("Coupon deleted");
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
    // The API says why (for example that orders used it)
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// ---------- Checkout ----------

export type CouponStatus = "none" | "checking" | "applied" | "error";

export interface CheckoutCoupon {
  /** The code the customer applied (in capitals), or null */
  code: string | null;
  status: CouponStatus;
  /** What the API says the code takes off these items. 0 until it says so */
  discount: number;
  /** Why the code does not work (only when status is "error") */
  message: string | null;
  apply: (raw: string) => void;
  remove: () => void;
}

// The coupon of the checkout. Only the CODE is kept here: the discount always comes from the API,
// for the items that are ordered right now, so it can never be an old number
export function useCheckoutCoupon(items: CartItem[]): CheckoutCoupon {
  const [code, setCode] = useState<string | null>(null);

  // The API prices by PRODUCT (the price is on the product, not on the option), so two options of the
  // same shirt are ONE line for it, with the sum of their quantities. The option is never sent
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(
      item.product.id,
      (quantities.get(item.product.id) ?? 0) + item.quantity,
    );
  }
  const lines = [...quantities].map(([product, quantity]) => ({
    product,
    quantity,
  }));
  const itemsKey = lines
    .map((line) => `${line.product}:${line.quantity}`)
    .join(",");

  // The items settle for 400 ms before the code is checked again: ticking items on and off
  // quickly must not send a request for each tick (the API limits these requests)
  const [settledKey, setSettledKey] = useState(itemsKey);
  useEffect(() => {
    if (settledKey === itemsKey) return;
    const timer = window.setTimeout(() => setSettledKey(itemsKey), 400);
    return () => window.clearTimeout(timer);
  }, [itemsKey, settledKey]);
  const settled = settledKey === itemsKey;

  const query = useQuery({
    queryKey: couponKeys.check(code, settledKey),
    enabled: code !== null && lines.length > 0,
    queryFn: async ({ signal }) => {
      const { data } = await api.post<CouponCheckResponse>(
        "/coupons/validate",
        { code, items: lines },
        { signal },
      );
      return data;
    },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // While the new numbers load, the old ones stay on the screen (the order button is locked meanwhile)
    placeholderData: keepPreviousData,
  });

  let status: CouponStatus = "none";
  if (code !== null) {
    if (!settled) status = "checking";
    else if (query.isError) status = "error";
    else if (query.data && !query.isFetching) status = "applied";
    else status = "checking";
  }

  const discount =
    code !== null && status !== "error" && query.data
      ? query.data.totals.discount
      : 0;
  const message =
    status === "error"
      ? getErrorMessage(query.error, "We could not check this code. Try again.")
      : null;

  return {
    code,
    status,
    discount,
    message,
    apply: (raw) => {
      const normalized = raw.trim().toUpperCase();
      if (!normalized) return;
      // The same code again: ask again (the answer may have changed)
      if (normalized === code) {
        void query.refetch();
        return;
      }
      setCode(normalized);
    },
    remove: () => setCode(null),
  };
}
