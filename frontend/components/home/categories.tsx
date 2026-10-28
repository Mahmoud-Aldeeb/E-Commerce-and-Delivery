import Link from "next/link";
import SectionHeader from "@/components/ui/section-header";
import { buildHref } from "@/lib/product-filters";
import { getCategoryNames } from "@/lib/server/categories";
import { safely } from "@/lib/server/safely";

export default async function Categories() {
  const categories = (await safely(getCategoryNames)) ?? [];

  // Secondary content: show nothing when it failed or when there are no categories yet
  if (categories.length === 0) return null;

  return (
    <section className="py-10">
      <SectionHeader title="Shop by category" subtitle="Find what you need faster" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {categories.map((name) => (
          <Link
            key={name}
            href={buildHref("/products", { category: name })}
            className="card flex items-center justify-center p-4 text-center text-sm font-medium leading-tight transition-colors hover:border-primary-600 hover:text-primary-700"
          >
            {name}
          </Link>
        ))}
      </div>
    </section>
  );
}