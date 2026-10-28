// app/admin/delivery-partners/page.tsx
import type { Metadata } from "next";
import PartnersView from "@/components/admin/partners-view";

export const metadata: Metadata = { title: "Delivery partners" };

export default function AdminPartnersPage() {
  return <PartnersView />;
}