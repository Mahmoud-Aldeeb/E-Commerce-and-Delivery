import AnnouncementBar from "@/components/layout/announcement-bar";
import CartSidebar from "@/components/layout/cart-sidebar";
import Footer from "@/components/layout/footer";
import Navbar from "@/components/layout/navbar";
import { getCategoryNames } from "@/lib/server/categories";
import { safely } from "@/lib/server/safely";

// Every page inside the (shop) group gets the announcement bar, header, footer and cart drawer
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  // A failed load only hides the categories of the header: the page itself still works
  const categories = (await safely(getCategoryNames)) ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <AnnouncementBar />
      <Navbar categories={categories} />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartSidebar />
    </div>
  );
}