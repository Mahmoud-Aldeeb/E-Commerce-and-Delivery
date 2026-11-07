"use client";

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "@/lib/api";
import { orderKeys } from "@/lib/queries/orders";
import { productKeys } from "@/lib/queries/products";
import type { DeliveryPartner, Order, Product, StoreCategory } from "@/types";
import { categoryKeys } from "@/lib/queries/categories";
import type { VariantPayload } from "@/lib/variants";

export interface AdminStats {
  totalOrders: number;
  totalUsers: number;
  totalProducts: number;
  outOfStock: number;
  totalPartners: number;
  recentOrders: Order[];
}

export const adminKeys = {
  stats: ["admin", "stats"] as const,
  orders: ["admin", "orders"] as const,
  partners: ["admin", "partners"] as const,
  analytics: ["admin", "analytics"] as const,
};

export const adminStatsOptions = () =>
  queryOptions({
    queryKey: adminKeys.stats,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AdminStats>("/admin/stats", { signal });
      return data;
    },
    staleTime: 30_000,
  });

// get the list of orders for the admin panel, with filters and pagination
export type AdminOrderTab =
  | "all"
  | "needs-courier"
  | "in-progress"
  | "delivered"
  | "cancelled";

export const ADMIN_ORDERS_PAGE_SIZE = 15;

export interface AdminOrdersPage {
  orders: Order[];
  total: number;
  page: number;
  pages: number;
  /** One number per tab. They ignore the search text */
  counts: Record<AdminOrderTab, number>;
}

export interface AdminOrdersFilters {
  tab: AdminOrderTab;
  search: string;
  page: number;
}

// The key starts with adminKeys.orders: invalidating it refreshes every page and filter
export const adminOrdersOptions = ({ tab, search, page }: AdminOrdersFilters) =>
  queryOptions({
    queryKey: [...adminKeys.orders, { tab, search, page }] as const,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AdminOrdersPage>("/orders/all", {
        params: {
          tab,
          search: search || undefined,
          page,
          limit: ADMIN_ORDERS_PAGE_SIZE,
        },
        signal,
      });
      return data;
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

export const partnersOptions = () =>
  queryOptions({
    queryKey: adminKeys.partners,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ partners: DeliveryPartner[] }>(
        "/admin/delivery-partners",
        { signal },
      );
      return data.partners;
    },
  });

// ---------- Orders ----------

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await api.put<{ order: Order }>(`/orders/${id}/status`, {
        status,
      });
      return data.order;
    },
    onSuccess: () => {
      toast.success("Order status updated");
      queryClient.invalidateQueries({ queryKey: adminKeys.orders });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useAssignPartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      partnerId,
    }: {
      orderId: string;
      partnerId: string;
    }) => {
      const { data } = await api.put<{ order: Order }>(
        `/admin/orders/${orderId}/assign`,
        {
          partnerId,
        },
      );
      return data.order;
    },
    onSuccess: () => {
      toast.success("Courier assigned");
      queryClient.invalidateQueries({ queryKey: adminKeys.orders });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// ---------- Delivery partners ----------

export interface NewPartner {
  name: string;
  email: string;
  password: string;
  phone: string;
  vehicleType: DeliveryPartner["vehicleType"];
}

export function useCreatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewPartner) => {
      const { data } = await api.post<{ partner: DeliveryPartner }>(
        "/admin/delivery-partners",
        input,
      );
      return data.partner;
    },
    onSuccess: () => {
      toast.success("Delivery partner created");
      queryClient.invalidateQueries({ queryKey: adminKeys.partners });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useTogglePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { data } = await api.put<{ partner: DeliveryPartner }>(
        `/admin/delivery-partners/${id}`,
        {
          isActive,
        },
      );
      return data.partner;
    },
    onSuccess: (_partner, variables) => {
      toast.success(
        variables.isActive ? "Partner activated" : "Partner deactivated",
      );
      queryClient.invalidateQueries({ queryKey: adminKeys.partners });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

// ---------- Products ----------

export interface ProductFields {
  name: string;
  description: string;
  category: string;
  price: number;
  originalPrice: number; // 0 means "no discount"
  image: string; // the main image (an url: images are uploaded as soon as they are picked)
  images: string[]; // the other images (up to 8)
  brand: string; // "" clears it
  material: string; // "" clears it
  variants: VariantPayload[]; // [] = a product without options
  // Only for a product WITHOUT options: with options the API works the total out from them
  // and refuses a stock that is sent
  stock?: number;
}

export type SaveProductVariables = ProductFields & {
  id?: string; // present = update, absent = create
};

// Uploads ONE image and gives back its url. The form calls it as soon as an image is picked
export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("image", file);
      const { data } = await api.post<{ url: string }>("/upload", form);
      return data.url;
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useSaveProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...body }: SaveProductVariables) => {
      const { data } = id
        ? await api.put<{ product: Product }>(`/products/${id}`, body)
        : await api.post<{ product: Product }>("/products", body);
      return data.product;
    },
    onSuccess: (_product, variables) => {
      toast.success(variables.id ? "Product updated" : "Product created");
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useMarkOutOfStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/products/${id}`); // the API sets the stock to 0 (the product is kept)
    },
    onSuccess: () => {
      toast.success("Product marked as out of stock");
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useRetryRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ order: Order; refund: string }>(
        `/admin/orders/${id}/refund`,
      );
      return data;
    },
    onSuccess: ({ refund }) => {
      if (refund === "failed")
        toast.error(
          "The refund failed again. Check Stripe and the server log.",
        );
      else
        toast.success(
          refund === "pending" ? "Refund is pending" : "Refund issued",
        );
      queryClient.invalidateQueries({ queryKey: adminKeys.analytics });
      queryClient.invalidateQueries({ queryKey: adminKeys.orders });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
// ---------- Categories ----------

export interface CategoryFields {
  name: string;
  sortOrder?: number;
}

export type SaveCategoryVariables = CategoryFields & {
  id?: string; // present = update, absent = create
};

export function useSaveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...fields }: SaveCategoryVariables) => {
      // JSON leaves out undefined values, so a field that was not set is simply not sent
      const { data } = id
        ? await api.put<{ category: StoreCategory }>(
            `/categories/${id}`,
            fields,
          )
        : await api.post<{ category: StoreCategory }>("/categories", fields);
      return data.category;
    },
    onSuccess: (_category, variables) => {
      toast.success(variables.id ? "Category updated" : "Category created");
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      // A new name is applied to the products of the category too
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/categories/${id}`);
    },
    onSuccess: () => {
      toast.success("Category deleted");
      queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    },
    // The API says why (for example that the category still has products)
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
