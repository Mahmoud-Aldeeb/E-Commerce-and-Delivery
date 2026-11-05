import type { Metadata } from "next";
import CashView from "@/components/admin/cash-view";

export const metadata: Metadata = { title: "Cash" };

export default function AdminCashPage() {
  return <CashView />;
}