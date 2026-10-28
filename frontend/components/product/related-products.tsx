import ProductList from "@/components/product/product-list";
import SectionHeader from "@/components/ui/section-header";
import { buildHref } from "@/lib/product-filters";
import { getRelatedProducts } from "@/lib/server/products";
import { safely } from "@/lib/server/safely";

export default async function RelatedProducts({
  productId,
  category,
}: {
  productId: string;
  category: string;
}) {
  const products = await safely(() => getRelatedProducts(category));

  // The current product is not a suggestion for itself
  const suggestions = (products ?? []).filter((product) => product.id !== productId).slice(0, 5);

  // Secondary content: show nothing when it failed or when there is nothing to show
  if (suggestions.length === 0) return null;

  return (
    <section className="mt-14">
      <SectionHeader
        title="You may also like"
        subtitle={`More from ${category}`}
        href={buildHref("/products", { category })}
      />
      <ProductList products={suggestions} />
    </section>
  );
}