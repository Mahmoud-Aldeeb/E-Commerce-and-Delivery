import type { Metadata } from "next";
import OrdersView from "@/components/orders/orders-view";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default function OrdersPage() {
  return <OrdersView />;
}