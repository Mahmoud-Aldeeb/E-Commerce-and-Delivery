import type { Metadata } from "next";
import CheckoutView from "@/components/checkout/checkout-view";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage() {
  return <CheckoutView />;
}