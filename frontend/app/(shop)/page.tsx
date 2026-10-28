import Categories from "@/components/home/categories";
import Features from "@/components/home/features";
import Hero from "@/components/home/hero";
import {
  FlashDealsSection,
  PopularProductsSection,
} from "@/components/home/product-sections";


export default async function HomePage() {
  return (
    <div className="container-page py-6 sm:py-8">
      <Hero />
      <Features />
      <Categories />
      <FlashDealsSection />
      <PopularProductsSection />
    </div>
  );
}