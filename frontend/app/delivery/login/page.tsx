// app/delivery/login/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import DeliveryLoginView from "@/components/delivery/delivery-login-view";

export const metadata: Metadata = { title: "Sign in" };

export default function DeliveryLoginPage() {
  // useSearchParams (inside the view) must be wrapped in Suspense
  return (
    <Suspense>
      <DeliveryLoginView />
    </Suspense>
  );
}