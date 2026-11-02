import type { Metadata } from "next";
import FavoritesView from "@/components/favorites/favorites-view";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "My favorites", robots: { index: false } };

export default function FavoritesPage() {
  return <FavoritesView />;
}