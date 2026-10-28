// app/delivery/(portal)/page.tsx
import type { Metadata } from "next";
import DashboardView from "@/components/delivery/dashboard-view";

export const metadata: Metadata = { title: "My deliveries" };

export default function DeliveryDashboardPage() {
  return <DashboardView />;
}