import type { Metadata } from "next";
import WalletView from "@/components/account/wallet-view";

export const metadata: Metadata = { title: "My wallet" };

export default function WalletPage() {
  return <WalletView />;
}