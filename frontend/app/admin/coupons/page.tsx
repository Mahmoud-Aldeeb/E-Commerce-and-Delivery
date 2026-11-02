import type { Metadata } from "next";
import CouponsView from "@/components/admin/coupons-view";

export const metadata: Metadata = { title: "Coupons" };

export default function AdminCouponsPage() {
  return <CouponsView />;
}