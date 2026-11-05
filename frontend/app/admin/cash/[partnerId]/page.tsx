import type { Metadata } from "next";
import { Suspense } from "react";
import PartnerCashView from "@/components/admin/partner-cash-view";

export const metadata: Metadata = { title: "Courier cash" };

type Props = { params: Promise<{ partnerId: string }> };

// The id comes from the URL (request-time data), so it is read under Suspense
async function PartnerCashContent({ params }: Props) {
  const { partnerId } = await params;
  return <PartnerCashView partnerId={partnerId} />;
}

export default function AdminPartnerCashPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="skeleton h-64 w-full" aria-busy="true" />}>
      <PartnerCashContent params={params} />
    </Suspense>
  );
}