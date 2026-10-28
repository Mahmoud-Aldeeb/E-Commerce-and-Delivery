"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  PackageIcon,
  ShoppingBagIcon,
  TriangleAlertIcon,
  TruckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import PageHeader from "@/components/admin/page-header";
import OrderStatusBadge from "@/components/orders/order-status-badge";
import EmptyState from "@/components/ui/empty-state";
import { formatDate, formatPrice } from "@/lib/format";
import { itemCount, orderNumber } from "@/lib/orders";
import { adminStatsOptions } from "@/lib/queries/admin";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
  warn?: boolean;
}

function StatCard({ label, value, icon: Icon, href, warn = false }: StatCardProps) {
  const body = (
    <>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-ink-muted">{label}</p>
      </div>
      <span
        className={`flex size-10 items-center justify-center rounded-full ${warn ? "bg-warning-soft text-warning" : "bg-primary-50 text-primary-700"
          }`}
      >
        <Icon className="size-5" />
      </span>
    </>
  );
  const base = "card flex items-center justify-between gap-3 p-5";

  return href ? (
    <Link href={href} className={`${base} transition-shadow hover:shadow-pop`}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

export default function DashboardView() {
  const { data, isPending, isError, refetch } = useQuery(adminStatsOptions());

  if (isError) {
    return (
      <EmptyState
        icon={TriangleAlertIcon}
        title="We couldn't load the dashboard"
        action={
          <button onClick={() => refetch()} className="btn btn-secondary">
            Try again
          </button>
        }
      />
    );
  }

  const recent = data?.recentOrders ?? [];

  return (
    <>
      <PageHeader title="Dashboard" description="A quick look at your store." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {!data ? (
          Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-[88px]" />)
        ) : (
          <>
            <StatCard label="Orders" value={data.totalOrders} icon={ShoppingBagIcon} href="/admin/orders" />
            <StatCard label="Customers" value={data.totalUsers} icon={UsersIcon} />
            <StatCard label="Products" value={data.totalProducts} icon={PackageIcon} href="/admin/products" />
            <StatCard
              label="Out of stock"
              value={data.outOfStock}
              icon={AlertTriangleIcon}
              href="/admin/products"
              warn={data.outOfStock > 0}
            />
            <StatCard
              label="Delivery partners"
              value={data.totalPartners}
              icon={TruckIcon}
              href="/admin/delivery-partners"
            />
          </>
        )}
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-primary-700 hover:underline">
            View all
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="bg-canvas text-xs uppercase text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                <th scope="col" className="px-5 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-5 py-3 font-semibold">Items</th>
                <th scope="col" className="px-5 py-3 font-semibold">Total</th>
                <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                <th scope="col" className="px-5 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isPending ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8">
                    <div className="skeleton h-4 w-full" />
                  </td>
                </tr>
              ) : recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-ink-muted">
                    No orders yet.
                  </td>
                </tr>
              ) : (
                recent.map((order) => (
                  <tr key={order.id}>
                    <td className="px-5 py-3 font-mono text-xs text-ink-soft">{orderNumber(order.id)}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium">{order.user?.name ?? "-"}</p>
                      <p className="text-xs text-ink-muted">{order.user?.email}</p>
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{itemCount(order)}</td>
                    <td className="px-5 py-3 font-medium">{formatPrice(order.total)}</td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-3 text-ink-soft">{formatDate(order.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}