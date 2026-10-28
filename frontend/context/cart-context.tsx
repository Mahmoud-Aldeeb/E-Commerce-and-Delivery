"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createLocalStore, useIsClient, useLocalStore } from "@/lib/local-store";
import type { CartItem, Product } from "@/types";

interface CartContextValue {
  items: CartItem[];
  /** false until the saved cart has been read in the browser */
  isReady: boolean;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartCount: number;
  /** Subtotal: the sum of price x quantity (delivery and tax are added at checkout) */
  cartTotal: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const cartStore = createLocalStore<CartItem[]>({
  key: "app_cart",
  fallback: [],
  parse: (raw) => {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    // Drop anything that does not look like a cart line
    return (value as CartItem[]).filter(
      (item) => item?.product?.id && Number(item.quantity) > 0,
    );
  },
});

const CartContext = createContext<CartContextValue | undefined>(undefined);

// A cart line can never go above the stock the product had when it was added
const maxQuantity = (product: Product) => product.stock ?? Number.POSITIVE_INFINITY;

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useLocalStore(cartStore);
  const isReady = useIsClient();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = useCallback((product: Product, quantity = 1) => {
    const current = cartStore.getSnapshot();
    const existing = current.find((item) => item.product.id === product.id);
    const nextQuantity = Math.min(
      (existing?.quantity ?? 0) + quantity,
      maxQuantity(product),
    );
    if (nextQuantity <= 0) return;

    cartStore.set(
      existing
        ? // `product` is refreshed too, so the line keeps the latest price and stock
        current.map((item) =>
          item.product.id === product.id
            ? { product, quantity: nextQuantity }
            : item,
        )
        : [...current, { product, quantity: nextQuantity }],
    );
    setIsCartOpen(true);
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    cartStore.set(cartStore.getSnapshot().filter((item) => item.product.id !== productId));
  }, []);

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(productId);
        return;
      }
      cartStore.set(
        cartStore
          .getSnapshot()
          .map((item) =>
            item.product.id === productId
              ? { ...item, quantity: Math.min(quantity, maxQuantity(item.product)) }
              : item,
          ),
      );
    },
    [removeFromCart],
  );

  const clearCart = useCallback(() => {
    cartStore.set([]);
    setIsCartOpen(false);
  }, []);

  // Derived values, never stored: they cannot disagree with `items`
  const cartCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );
  const cartTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      isReady,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartCount,
      cartTotal,
      isCartOpen,
      setIsCartOpen,
    }),
    [
      items,
      isReady,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartCount,
      cartTotal,
      isCartOpen,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}