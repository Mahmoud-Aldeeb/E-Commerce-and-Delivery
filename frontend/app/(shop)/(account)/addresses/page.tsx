import type { Metadata } from "next";
import AddressesView from "@/components/address/addresses-view";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "My addresses", robots: { index: false } };

export default function AddressesPage() {
  return <AddressesView />;
}