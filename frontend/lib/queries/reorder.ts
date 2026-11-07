"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useCart } from "@/context/cart-context";
import { getErrorMessage, getErrorStatus } from "@/lib/api";
import { productDetailOptions } from "@/lib/queries/products";
import { listNames, planReorder } from "@/lib/reorder";
import type { Order } from "@/types";

export function useReorder() {
  const queryClient = useQueryClient();
  const { addToCart } = useCart();

  return useMutation({
    mutationFn: async (order: Order) => {
      // The CURRENT price, stock and options of every product (staleTime 0: never an old copy)
      const results = await Promise.allSettled(
        order.items.map((item) =>
          queryClient.fetchQuery({
            ...productDetailOptions(item.product),
            staleTime: 0,
          }),
        ),
      );

      // A product that does not exist (404) is simply unavailable. Any other failure
      // (the network, the server) says nothing about the products: report it, do not guess
      const failure = results.find(
        (result) =>
          result.status === "rejected" && getErrorStatus(result.reason) !== 404,
      );
      if (failure && failure.status === "rejected") throw failure.reason;

      const products = results.map((result) =>
        result.status === "fulfilled" ? result.value : null,
      );
      return planReorder(order.items, products);
    },

    onSuccess: (plan) => {
      const chooseNote =
        plan.chooseOptions.length > 0
          ? `Choose the size or colour yourself: ${listNames(plan.chooseOptions)}`
          : null;

      if (plan.add.length === 0) {
        toast.error(
          chooseNote ??
            "None of the items in this order are available right now.",
        );
        return;
      }

      // addToCart adds to what the cart already holds (never above the stock of the option) and opens the cart
      for (const line of plan.add)
        addToCart(line.product, line.quantity, line.variant);

      const count = plan.add.length;
      toast.success(
        `${count} ${count === 1 ? "item" : "items"} added to your cart`,
      );

      const notes: string[] = [];
      if (plan.reduced.length > 0) {
        notes.push(`Less stock than before: ${listNames(plan.reduced)}`);
      }
      if (plan.unavailable.length > 0) {
        notes.push(`Not available: ${listNames(plan.unavailable)}`);
      }
      if (chooseNote) notes.push(chooseNote);
      if (notes.length > 0) toast(notes.join(". "), { duration: 7000 });
    },

    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
