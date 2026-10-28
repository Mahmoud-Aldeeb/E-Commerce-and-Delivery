// app/admin/orders/page.tsx
import type { Metadata } from "next";
import OrdersView from "@/components/admin/orders-view";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return <OrdersView />;
}