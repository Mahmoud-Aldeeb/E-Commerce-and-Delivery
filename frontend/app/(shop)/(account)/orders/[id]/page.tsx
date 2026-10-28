// app/(shop)/(account)/orders/[id]/page.tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import OrderTrackingView from "@/components/orders/order-tracking-view";
import PageLoader from "@/components/ui/page-loader";

// Private page: keep it out of search engines
export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

export const instant = false;

type Props = { params: Promise<{ id: string }> };

async function Tracking({ params }: Props) {
  const { id } = await params;
  return <OrderTrackingView id={id} />;
}

export default function OrderPage({ params }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Tracking params={params} />
    </Suspense>
  );
}