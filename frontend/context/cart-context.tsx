"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { keyOf, lineKey, maxQuantity } from "@/lib/cart-line";
import { createLocalStore, useIsClient, useLocalStore } from "@/lib/local-store";
import type { CartItem, Product, ProductVariant } from "@/types";

// What an order contains: the id of a product, its option (when it has one) and how many of it
export interface OrderedLine {
  product: string;
  variant?: string | null;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  /** false until the saved cart has been read in the browser */
  isReady: boolean;
  /** A product that has options must come with the chosen one: without it nothing is added */
  addToCart: (product: Product, quantity?: number, variant?: ProductVariant | null) => void;
  /** `key` = keyOf(item): the product id, plus the option id when the product has options */
  removeFromCart: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
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
  isSelected: (key: string) => boolean;
  toggleSelected: (key: string) => void;
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
    // Drop anything that does not look like a cart line (a line with an option must say which one)
    return (value as CartItem[]).filter(
      (item) =>
        item?.product?.id &&
        Number(item.quantity) > 0 &&
        (item.variant == null || typeof item.variant.id === "string"),
    );
  },
});

// The lines the customer UNticked, by line key. Everything in the cart is ticked by default, so a
// product added later is ticked without anyone doing anything, and no list has to be kept in step
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

// Adding a product is a wish to buy it: a line that was unticked before is ticked again
const selectAgain = (key: string) => {
  const current = unselectedStore.getSnapshot();
  if (current.includes(key)) {
    unselectedStore.set(current.filter((id) => id !== key));
  }
};

// A line that left the cart must not stay in the "unticked" list
const forgetUnselected = (stillInCart: CartItem[]) => {
  const keys = new Set(stillInCart.map(keyOf));
  const current = unselectedStore.getSnapshot();
  const next = current.filter((key) => keys.has(key));
  if (next.length !== current.length) unselectedStore.set(next);
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useLocalStore(cartStore);
  const unselected = useLocalStore(unselectedStore);
  const isReady = useIsClient();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = useCallback(
    (product: Product, quantity = 1, variant: ProductVariant | null = null) => {
      // A product with sizes/colours is bought by choosing one
      if (product.variantCount > 0 && !variant) return;

      const key = lineKey(product.id, variant?.id);
      const current = cartStore.getSnapshot();
      const existing = current.find((item) => keyOf(item) === key);
      // A line never goes above the stock the option (or the product) had when it was added
      const nextQuantity = Math.min(
        (existing?.quantity ?? 0) + quantity,
        maxQuantity(product, variant),
      );
      if (nextQuantity <= 0) return;

      // The line keeps a slim copy of the product: its options can be a hundred, and the one
      // that was chosen is in `variant`. The copy is refreshed on every add, so the line keeps
      // the latest price and stock
      const line: CartItem = {
        product: { ...product, variants: undefined },
        variant,
        quantity: nextQuantity,
      };

      cartStore.set(
        existing
          ? current.map((item) => (keyOf(item) === key ? line : item))
          : [...current, line],
      );
      selectAgain(key);
      setIsCartOpen(true);
    },
    [],
  );

  const removeFromCart = useCallback((key: string) => {
    const next = cartStore.getSnapshot().filter((item) => keyOf(item) !== key);
    cartStore.set(next);
    forgetUnselected(next);
  }, []);

  const updateQuantity = useCallback(
    (key: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(key);
        return;
      }
      cartStore.set(
        cartStore
          .getSnapshot()
          .map((item) =>
            keyOf(item) === key
              ? { ...item, quantity: Math.min(quantity, maxQuantity(item.product, item.variant)) }
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
      ordered.map((line): [string, number] => [
        lineKey(line.product, line.variant),
        line.quantity,
      ]),
    );

    const next = cartStore.getSnapshot().flatMap((item) => {
      const quantity = bought.get(keyOf(item));
      if (quantity === undefined) return [item];
      const remaining = item.quantity - quantity;
      return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
    });

    cartStore.set(next);
    // The order is done: whatever is left starts ticked again
    unselectedStore.set([]);
    setIsCartOpen(false);
  }, []);

  const toggleSelected = useCallback((key: string) => {
    const current = unselectedStore.getSnapshot();
    unselectedStore.set(
      current.includes(key)
        ? current.filter((id) => id !== key)
        : [...current, key],
    );
  }, []);

  const setAllSelected = useCallback((selected: boolean) => {
    unselectedStore.set(selected ? [] : cartStore.getSnapshot().map(keyOf));
  }, []);

  const unselectedSet = useMemo(() => new Set(unselected), [unselected]);

  const isSelected = useCallback(
    (key: string) => !unselectedSet.has(key),
    [unselectedSet],
  );

  // Derived values, never stored: they cannot disagree with `items`
  const selectedItems = useMemo(
    () => items.filter((item) => !unselectedSet.has(keyOf(item))),
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