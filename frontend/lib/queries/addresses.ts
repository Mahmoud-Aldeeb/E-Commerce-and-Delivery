"use client";

import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api, { getErrorMessage } from "@/lib/api";
import type { Address } from "@/types";

export type AddressInput = Pick<
  Address,
  "label" | "address" | "city" | "state" | "zip" | "isDefault" | "lat" | "lng"
>;

// With an id it updates that address, without one it creates a new address
export type SaveAddressVariables = AddressInput & { id?: string };

interface AddressesResponse {
  addresses: Address[];
}

export const addressKeys = { all: ["addresses"] as const };

export const addressesOptions = () =>
  queryOptions({
    queryKey: addressKeys.all,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<AddressesResponse>("/addresses", {
        signal,
      });
      return data.addresses;
    },
  });

// Every write answers with the full, updated list: put it straight in the cache (no refetch)
export function useSaveAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: SaveAddressVariables) => {
      const { data } = id
        ? await api.put<AddressesResponse>(`/addresses/${id}`, input)
        : await api.post<AddressesResponse>("/addresses", input);
      return data.addresses;
    },
    onSuccess: (addresses) =>
      queryClient.setQueryData(addressKeys.all, addresses),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<AddressesResponse>(`/addresses/${id}`);
      return data.addresses;
    },
    onSuccess: (addresses) =>
      queryClient.setQueryData(addressKeys.all, addresses),
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
