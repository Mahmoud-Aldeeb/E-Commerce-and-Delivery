// app/delivery/layout.tsx
import type { Metadata } from "next";
import { DeliveryAuthProvider } from "@/context/delivery-auth-context";

export const metadata: Metadata = {
  title: { default: "Delivery", template: "%s | Delivery" },
  robots: { index: false, follow: false },
};

// The partner session exists only inside /delivery: the store pages never load it
export default function DeliveryRootLayout({ children }: { children: React.ReactNode }) {
  return <DeliveryAuthProvider>{children}</DeliveryAuthProvider>;
}