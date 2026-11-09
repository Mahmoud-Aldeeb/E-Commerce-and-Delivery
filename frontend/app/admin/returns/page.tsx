import type { Metadata } from "next";
import ReturnsView from "@/components/admin/returns-view";

export const metadata: Metadata = { title: "Returns" };

export default function AdminReturnsPage() {
  return <ReturnsView />;
}