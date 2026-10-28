
import SectionHeader from "@/components/ui/section-header";
import { getFlashDeals, getPopularProducts } from "@/lib/server/products";
import ProductList from "../product/product-list";

// Both sections read data that the home page already prefetched on the server,
// so on the first render the products are there (no loading flash)

export async function FlashDealsSection() {
  const deals = await getFlashDeals();

  // No deals at the moment: hide the whole section instead of showing an empty box
  if (deals.length === 0) return null;

  return (
    <section className="py-10">
      <SectionHeader
        title="Today's deals"
        subtitle="The biggest price drops right now"
        href="/deals"
        linkLabel="View all deals"
      />
      <ProductList products={deals.slice(0, 5)} />
    </section>
  );
}

export async function PopularProductsSection() {
  const products = await getPopularProducts();

  return (
    <section className="py-10">
      <SectionHeader
        title="Popular products"
        subtitle="Top rated by our customers"
        href="/products"
      />
      <ProductList products={products} emptyMessage="No products yet. Check back soon." />
    </section>
  );
}