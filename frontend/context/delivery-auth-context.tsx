"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import deliveryApi, { DELIVERY_PARTNER_KEY, DELIVERY_TOKEN_KEY } from "@/lib/delivery-api";
import { createLocalStore, useIsClient, useLocalStore } from "@/lib/local-store";
import type { DeliveryPartner } from "@/types";

interface LoginResponse {
  partner: DeliveryPartner;
  token: string;
}

interface DeliveryAuthValue {
  partner: DeliveryPartner | null;
  /** false until the saved session has been read in the browser */
  isReady: boolean;
  login: (email: string, password: string) => Promise<DeliveryPartner>;
  logout: () => void;
}

const tokenStore = createLocalStore<string | null>({
  key: DELIVERY_TOKEN_KEY,
  fallback: null,
  parse: (raw) => raw,
  serialize: (value) => value ?? "",
});

const partnerStore = createLocalStore<DeliveryPartner | null>({
  key: DELIVERY_PARTNER_KEY,
  fallback: null,
  parse: (raw) => JSON.parse(raw) as DeliveryPartner,
});

const DeliveryAuthContext = createContext<DeliveryAuthValue | undefined>(undefined);

export function DeliveryAuthProvider({ children }: { children: ReactNode }) {
  const token = useLocalStore(tokenStore);
  const storedPartner = useLocalStore(partnerStore);
  const isReady = useIsClient();

  // A partner without a token (or the opposite) is a broken session: treat it as signed out
  const partner = token ? storedPartner : null;

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await deliveryApi.post<LoginResponse>("/delivery/login", {
      email,
      password,
    });
    tokenStore.set(data.token);
    partnerStore.set(data.partner);
    return data.partner;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    partnerStore.clear();
    // A full navigation also stops the location sharing and empties every cache
    // window.location.assign("/delivery/login");
    window.location.href = new URL(
      "/delivery/login",
      window.location.origin
    ).toString();
  }, []);

  const value = useMemo(
    () => ({ partner, isReady, login, logout }),
    [partner, isReady, login, logout],
  );

  return <DeliveryAuthContext.Provider value={value}>{children}</DeliveryAuthContext.Provider>;
}

export function useDeliveryAuth() {
  const context = useContext(DeliveryAuthContext);
  if (!context) throw new Error("useDeliveryAuth must be used within DeliveryAuthProvider");
  return context;
}