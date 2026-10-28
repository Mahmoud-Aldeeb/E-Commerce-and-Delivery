// app/admin/products/page.tsx
import type { Metadata } from "next";
import ProductsView from "@/components/admin/products-view";

export const metadata: Metadata = { title: "Products" };

export default function AdminProductsPage() {
  return <ProductsView />;
}