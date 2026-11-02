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

// What an order contains: the id of a product and how many of it
export interface OrderedLine {
  product: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  /** false until the saved cart has been read in the browser */
  isReady: boolean;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  /** After an order: takes out what was ordered. A line stays only if the cart held more than the order */
  removeOrderedItems: (ordered: OrderedLine[]) => void;
  /** Everything in the cart, ticked or not */
  cartCount: number;
  cartTotal: number;
  /** The lines that go to checkout: all of them, until the customer unticks one */
  selectedItems: CartItem[];
  /** Total quantity of the selected lines */
  selectedCount: number;
  /** Subtotal of the selected lines (delivery and tax are added at checkout) */
  selectedTotal: number;
  isSelected: (productId: string) => boolean;
  toggleSelected: (productId: string) => void;
  setAllSelected: (selected: boolean) => void;
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

// The products the customer UNticked. Everything in the cart is ticked by default, so a product
// added later is ticked without anyone doing anything, and no list has to be kept in step
const unselectedStore = createLocalStore<string[]>({
  key: "app_cart_unselected",
  fallback: [],
  parse: (raw) => {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  },
});

// Adding a product is a wish to buy it: one that was unticked before is ticked again
const selectAgain = (productId: string) => {
  const current = unselectedStore.getSnapshot();
  if (current.includes(productId)) {
    unselectedStore.set(current.filter((id) => id !== productId));
  }
};

// A product that left the cart must not stay in the "unticked" list
const forgetUnselected = (stillInCart: CartItem[]) => {
  const ids = new Set(stillInCart.map((item) => item.product.id));
  const current = unselectedStore.getSnapshot();
  const next = current.filter((id) => ids.has(id));
  if (next.length !== current.length) unselectedStore.set(next);
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

// A cart line can never go above the stock the product had when it was added
const maxQuantity = (product: Product) => product.stock ?? Number.POSITIVE_INFINITY;

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useLocalStore(cartStore);
  const unselected = useLocalStore(unselectedStore);
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
    selectAgain(product.id);
    setIsCartOpen(true);
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    const next = cartStore.getSnapshot().filter((item) => item.product.id !== productId);
    cartStore.set(next);
    forgetUnselected(next);
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
    unselectedStore.set([]);
    setIsCartOpen(false);
  }, []);

  const removeOrderedItems = useCallback((ordered: OrderedLine[]) => {
    const bought = new Map<string, number>(
      ordered.map((line): [string, number] => [line.product, line.quantity]),
    );

    const next = cartStore.getSnapshot().flatMap((item) => {
      const quantity = bought.get(item.product.id);
      if (quantity === undefined) return [item];
      const remaining = item.quantity - quantity;
      return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    });

    cartStore.set(next);
    // The order is done: whatever is left starts ticked again
    unselectedStore.set([]);
    setIsCartOpen(false);
  }, []);

  const toggleSelected = useCallback((productId: string) => {
    const current = unselectedStore.getSnapshot();
    unselectedStore.set(
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }, []);

  const setAllSelected = useCallback((selected: boolean) => {
    unselectedStore.set(
      selected ? [] : cartStore.getSnapshot().map((item) => item.product.id),
    );
  }, []);

  const unselectedSet = useMemo(() => new Set(unselected), [unselected]);

  const isSelected = useCallback(
    (productId: string) => !unselectedSet.has(productId),
    [unselectedSet],
  );

  // Derived values, never stored: they cannot disagree with `items`
  const selectedItems = useMemo(
    () => items.filter((item) => !unselectedSet.has(item.product.id)),
    [items, unselectedSet],
  );
  const cartCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );
  const cartTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items],
  );
  const selectedCount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems],
  );
  const selectedTotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [selectedItems],
  );

  const value = useMemo(
    () => ({
      items,
      isReady,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      removeOrderedItems,
      cartCount,
      cartTotal,
      selectedItems,
      selectedCount,
      selectedTotal,
      isSelected,
      toggleSelected,
      setAllSelected,
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
      removeOrderedItems,
      cartCount,
      cartTotal,
      selectedItems,
      selectedCount,
      selectedTotal,
      isSelected,
      toggleSelected,
      setAllSelected,
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