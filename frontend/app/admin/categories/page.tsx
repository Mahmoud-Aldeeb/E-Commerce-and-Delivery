import type { Metadata } from "next";
import CategoriesView from "@/components/admin/categories-view";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "Categories", robots: { index: false } };

export default function AdminCategoriesPage() {
  return <CategoriesView />;
}