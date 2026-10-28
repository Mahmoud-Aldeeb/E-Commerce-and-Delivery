"use client";

import { useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import toast, { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/context/auth-context";
import { CartProvider } from "@/context/cart-context";
import { getQueryClient } from "@/lib/query-client";

export default function Providers({ children }: { children: React.ReactNode }) {
  // No useState here on purpose: in the browser getQueryClient always returns the same client
  const queryClient = getQueryClient();

  // lib/api.ts announces rate limiting with a window event: show a single toast for it
  useEffect(() => {
    const onRateLimited = () =>
      toast.error("Too many requests. Please wait a moment and try again.", {
        id: "rate-limit",
      });
    window.addEventListener("api:rate-limited", onRateLimited);
    return () => window.removeEventListener("api:rate-limited", onRateLimited);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                background: "#111827",
                color: "#fff",
                borderRadius: "10px",
                fontSize: "14px",
                padding: "10px 14px",
              },
              success: { iconTheme: { primary: "#14b8a6", secondary: "#fff" } },
              error: { iconTheme: { primary: "#f87171", secondary: "#fff" } },
            }}
          />
        </CartProvider>
      </AuthProvider>
      {/* Development only: a floating button in the corner to inspect the cache */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}