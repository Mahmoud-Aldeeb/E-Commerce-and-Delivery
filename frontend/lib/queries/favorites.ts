"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "@/context/auth-context";
import api, { getErrorMessage } from "@/lib/api";
import type { Product } from "@/types";

// ["favorites"] is the start of both keys: invalidating it refreshes the ids AND the list
export const favoriteKeys = {
  all: ["favorites"] as const,
  ids: ["favorites", "ids"] as const,
  list: ["favorites", "list"] as const,
};

export const favoriteIdsOptions = () =>
  queryOptions({
    queryKey: favoriteKeys.ids,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ ids: string[] }>("/favorites/ids", {
        signal,
      });
      return data.ids;
    },
    staleTime: 60_000,
  });

export const favoritesOptions = () =>
  queryOptions({
    queryKey: favoriteKeys.list,
    queryFn: async ({ signal }) => {
      const { data } = await api.get<{ products: Product[] }>("/favorites", {
        signal,
      });
      return data.products;
    },
  });

// Only a signed-in user has favorites: for a visitor nothing is asked from the API
export function useFavoriteIds() {
  const { user } = useAuth();
  return useQuery({ ...favoriteIdsOptions(), enabled: Boolean(user) });
}

// The heart changes at once (optimistic) and goes back if the API refuses
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      favorite,
    }: {
      productId: string;
      favorite: boolean;
    }) => {
      if (favorite) await api.put(`/favorites/${productId}`);
      else await api.delete(`/favorites/${productId}`);
    },
    onMutate: async ({ productId, favorite }) => {
      await queryClient.cancelQueries({ queryKey: favoriteKeys.ids });
      const previous = queryClient.getQueryData<string[]>(favoriteKeys.ids);
      queryClient.setQueryData<string[]>(favoriteKeys.ids, (current = []) =>
        favorite
          ? [...new Set([...current, productId])]
          : current.filter((id) => id !== productId),
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(favoriteKeys.ids, context?.previous);
      toast.error(getErrorMessage(error));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoriteKeys.all });
    },
  });
}
