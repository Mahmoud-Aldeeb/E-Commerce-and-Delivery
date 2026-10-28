// app/admin/products/[id]/edit/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import ProductForm from "@/components/admin/product-form";
import PageLoader from "@/components/ui/page-loader";

export const metadata: Metadata = { title: "Edit product" };

type Props = { params: Promise<{ id: string }> };

async function Editor({ params }: Props) {
  const { id } = await params;
  return <ProductForm productId={id} />;
}

export default function EditProductPage({ params }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Editor params={params} />
    </Suspense>
  );
}