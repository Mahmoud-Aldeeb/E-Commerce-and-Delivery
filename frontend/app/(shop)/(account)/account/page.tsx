import type { Metadata } from "next";
import AccountView from "@/components/account/account-view";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountPage() {
  return <AccountView />;
}