import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ProductDetails from "@/components/product/product-details";
import ProductPageSkeleton from "@/components/product/product-page-skeleton";
import RelatedProducts from "@/components/product/related-products";
import Breadcrumbs from "@/components/ui/breadcrumbs";
import { getProduct } from "@/lib/server/products";
import { buildHref } from "@/lib/product-filters";
import { safely } from "@/lib/server/safely";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await safely(() => getProduct(id));

  if (!product) return { title: "Product not found" };

  const description = (product.description || `Buy ${product.name} online.`).slice(0, 160);

  return {
    title: product.name,
    description,
    openGraph: { title: product.name, description, images: [{ url: product.image }] },
  };
}

// The id comes from the URL (request-time data), so the product lives under Suspense
async function ProductContent({ params }: Props) {
  const { id } = await params;
  // A real failure (not a 404) is thrown here and handled by the error page
  const product = await getProduct(id);

  if (!product) notFound();



  // Structured data: lets Google show the price and availability in search results.
  // Ratings are left out on purpose: they are demo numbers, not real customer reviews.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.image,
    description: product.description ?? undefined,
    category: product.category,
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: product.price.toFixed(2),
      availability:
        (product.stock ?? 1) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Products", href: "/products" },
          {
            label: product.category,
            href: buildHref("/products", { category: product.category }),
          },
          { label: product.name },
        ]}
      />

      <ProductDetails product={product} />

      {/* Secondary content streams in by itself: it never delays the product above */}
      <Suspense fallback={null}>
        <RelatedProducts productId={product.id} category={product.category} />
      </Suspense>

      {/* "<" is escaped so a product name can never close the script tag */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </>
  );
}

export default function ProductPage({ params }: Props) {
  return (
    <div className="container-page py-6 pb-28 lg:pb-10">
      <Suspense fallback={<ProductPageSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </div>
  );
}