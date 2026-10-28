import type { Metadata } from "next";
import { ZapIcon } from "lucide-react";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { getFlashDeals } from "@/lib/server/products";
import ProductList from "@/components/product/product-list";


export const metadata: Metadata = {
  title: "Flash deals",
  description: "Limited-time price drops on our best products.",
};


export default async function DealsPage() {
  const deals = await getFlashDeals();

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Flash deals" }]} />

      <header className="mb-8 flex items-center gap-4 rounded-card border border-primary-100 bg-primary-50 p-6 sm:p-8">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-700 text-white">
          <ZapIcon className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Flash deals</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Limited-time price drops. When they are gone, they are gone.
          </p>
        </div>
      </header>

      <ProductList
        products={deals}
        eagerCount={5}
        emptyMessage="No deals right now. Check back soon!"
      />
    </div>
  );
}