"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PackageIcon, TriangleAlertIcon } from "lucide-react";
import OrderCard from "@/components/orders/order-card";
import EmptyState from "@/components/ui/empty-state";
import Pager from "@/components/ui/pager";
import { useCart } from "@/context/cart-context";
import { ordersOptions, type OrderTab } from "@/lib/queries/orders";

const TABS: { key: OrderTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY: Record<OrderTab, { title: string; description: string }> = {
  all: { title: "No orders yet", description: "When you place an order, it will show up here." },
  active: { title: "No active orders", description: "Orders that are on their way appear here." },
  delivered: { title: "No delivered orders", description: "Delivered orders will be listed here." },
  cancelled: { title: "No cancelled orders", description: "Nothing here, which is good news." },
};

export default function OrdersView() {
  const router = useRouter();
  const { clearCart } = useCart();

  const [tab, setTab] = useState<OrderTab>("all");
  const [page, setPage] = useState(1);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...ordersOptions(tab, page),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  // Fallback for links that still end with ?clearCart=true (the new link goes to the order page)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("clearCart") === "true") {
      clearCart();
      router.replace("/orders");
    }
  }, [clearCart, router]);

  const orders = data?.orders ?? [];
  // There are orders, but the requested page is past the last one (for example after a cancel)
  const pastLastPage = Boolean(data && orders.length === 0 && data.total > 0);

  function changeTab(next: OrderTab) {
    setTab(next);
    setPage(1); // a new filter starts again from the first page
  }

  function goToPage(next: number) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-bold tracking-tight">My orders</h1>

      <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter orders">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => changeTab(item.key)}
            aria-pressed={tab === item.key}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === item.key
                ? "bg-primary-700 text-white"
                : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
              }`}
          >
            {item.label}
            {data && <span className="ml-1.5 opacity-70">{data.counts[item.key]}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {isPending ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((item) => (
              <div key={item} className="card space-y-4 p-5">
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-14 w-2/3" />
                <div className="skeleton h-4 w-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={TriangleAlertIcon}
            title="We couldn't load your orders"
            action={
              <button onClick={() => refetch()} className="btn btn-secondary">
                Try again
              </button>
            }
          />
        ) : pastLastPage ? (
          <EmptyState
            icon={PackageIcon}
            title="There is nothing on this page"
            action={
              <button onClick={() => setPage(1)} className="btn btn-secondary">
                Go to the first page
              </button>
            }
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title={EMPTY[tab].title}
            description={EMPTY[tab].description}
            action={
              tab === "all" ? (
                <Link href="/products" className="btn btn-primary">
                  Start shopping
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
              {orders.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} />
                </li>
              ))}
            </ul>
            {data && <Pager page={data.page} pages={data.pages} onChange={goToPage} className="mt-6" />}
          </>
        )}
      </div>
    </div>
  );
}