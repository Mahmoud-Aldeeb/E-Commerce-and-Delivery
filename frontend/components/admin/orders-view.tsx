"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SearchIcon, ShoppingBagIcon, TriangleAlertIcon, TruckIcon } from "lucide-react";
import PageHeader from "@/components/admin/page-header";
import OrderStatusBadge from "@/components/orders/order-status-badge";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import EmptyState from "@/components/ui/empty-state";
import Modal from "@/components/ui/modal";
import Pager from "@/components/ui/pager";
import { formatDateTime, formatPrice } from "@/lib/format";
import { isActiveOrder, itemCount, orderNumber, paymentLabel } from "@/lib/orders";
import {
  adminOrdersOptions,
  partnersOptions,
  useAssignPartner,
  useRetryRefund,
  useUpdateOrderStatus,
  type AdminOrderTab,
} from "@/lib/queries/admin";
import type { Order } from "@/types";

const TABS: { key: AdminOrderTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "needs-courier", label: "Needs courier" },
  { key: "in-progress", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

// "Assigned" is not here on purpose: it only happens when a courier is assigned
const NEXT_STATUSES = ["Packed", "Out for Delivery", "Delivered", "Cancelled"];

const CONFIRMATIONS: Record<string, { title: string; description: string; label: string; danger: boolean }> = {
  Delivered: {
    title: "Mark as delivered?",
    description:
      "This skips the customer's delivery code. Use it only when you have confirmed that the order arrived.",
    label: "Mark delivered",
    danger: false,
  },
  Cancelled: {
    title: "Cancel this order?",
    description:
      "The items go back to stock, and a card payment is refunded in full automatically. The customer sees the order as cancelled.",
    label: "Cancel order",
    danger: true,
  },
};

function RefundChip({
  order,
  retrying,
  onRetry,
}: {
  order: Order;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (order.status !== "Cancelled" || order.paymentMethod !== "card" || !order.isPaid) return null;

  if (order.refundStatus === "refunded") return <span className="badge badge-success">Refunded</span>;
  if (order.refundStatus === "pending") return <span className="badge badge-warning">Refund pending</span>;

  // "failed", or nothing recorded: the server stopped in the middle, or the order was
  // cancelled before refunds existed
  return (
    <button
      onClick={onRetry}
      disabled={retrying}
      title="Try to refund again"
      className="badge badge-danger cursor-pointer transition-colors hover:bg-red-100"
    >
      {retrying ? "Refunding..." : "Refund needed: retry"}
    </button>
  );
}

function AssignDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const { data, isPending, isError } = useQuery(partnersOptions());
  const assign = useAssignPartner();
  const [selected, setSelected] = useState<string | null>(null);

  const partners = (data ?? []).filter((partner) => partner.isActive);

  return (
    <Modal
      title={order.deliveryPartner ? "Change courier" : "Assign a courier"}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <p className="mb-4 text-sm text-ink-soft">
        Order {orderNumber(order.id)}.
        {order.deliveryPartner && " The customer gets a new delivery code."}
      </p>

      {isPending ? (
        <div className="skeleton h-24 w-full" />
      ) : isError ? (
        <p className="text-sm text-danger">We couldn&apos;t load the couriers.</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-ink-soft">No active couriers. Add or activate one first.</p>
      ) : (
        <fieldset>
          <legend className="sr-only">Choose a courier</legend>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {partners.map((partner) => (
              <label
                key={partner.id}
                className={`flex cursor-pointer items-center gap-3 rounded-card border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${selected === partner.id ? "border-primary-600 bg-primary-50" : "border-line hover:border-line-strong"
                  }`}
              >
                <input
                  type="radio"
                  name="courier"
                  className="size-4 accent-primary-700"
                  checked={selected === partner.id}
                  onChange={() => setSelected(partner.id)}
                />
                <span className="flex size-8 items-center justify-center rounded-full bg-primary-700 text-xs font-semibold text-white">
                  {partner.name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span className="block text-sm font-medium">{partner.name}</span>
                  <span className="block text-xs capitalize text-ink-muted">
                    {partner.vehicleType} · {partner.phone}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn btn-secondary">
          Cancel
        </button>
        <button
          disabled={!selected || assign.isPending}
          onClick={() =>
            selected && assign.mutate({ orderId: order.id, partnerId: selected }, { onSuccess: onClose })
          }
          className="btn btn-primary"
        >
          {assign.isPending ? "Assigning..." : "Assign"}
        </button>
      </div>
    </Modal>
  );
}

export default function OrdersView() {
  const updateStatus = useUpdateOrderStatus();
  const retryRefund = useRetryRefund();

  const [tab, setTab] = useState<AdminOrderTab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState<Order | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ order: Order; status: string } | null>(null);

  // Wait until the admin stops typing before asking the API
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...adminOrdersOptions({ tab, search: debouncedSearch, page }),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  const orders = data?.orders ?? [];
  // There are orders, but the requested page is past the last one
  const pastLastPage = Boolean(data && orders.length === 0 && data.total > 0);

  function changeTab(next: AdminOrderTab) {
    setTab(next);
    setPage(1);
  }

  function handleStatusChange(order: Order, status: string) {
    if (CONFIRMATIONS[status]) setPendingStatus({ order, status });
    else updateStatus.mutate({ id: order.id, status });
  }

  const confirmation = pendingStatus && CONFIRMATIONS[pendingStatus.status];

  return (
    <>
      <PageHeader title="Orders" description="Assign couriers and follow every order." />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group" aria-label="Filter orders">
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

        <div className="relative lg:w-72">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order number or customer"
            aria-label="Search orders"
            className="input pl-10"
          />
        </div>
      </div>

      {isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load the orders"
          action={
            <button onClick={() => refetch()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : pastLastPage ? (
        <EmptyState
          icon={ShoppingBagIcon}
          title="There is nothing on this page"
          action={
            <button onClick={() => setPage(1)} className="btn btn-secondary">
              Go to the first page
            </button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ShoppingBagIcon}
          title="No orders here"
          description="Nothing matches this view right now."
        />
      ) : (
        <section className="card overflow-hidden">
          <div className={`overflow-x-auto transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="bg-canvas text-xs uppercase text-ink-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Total</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Courier</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((order) => {
                  const active = isActiveOrder(order);
                  const updating = updateStatus.isPending && updateStatus.variables?.id === order.id;

                  return (
                    <tr key={order.id}>
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-semibold">{orderNumber(order.id)}</p>
                        <p className="text-xs text-ink-muted">{formatDateTime(order.createdAt)}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{order.user?.name ?? "Unknown"}</p>
                        <p className="text-xs text-ink-muted">{order.user?.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium">{formatPrice(order.total)}</p>
                        <p className="text-xs text-ink-muted">
                          {itemCount(order)} items · {paymentLabel(order.paymentMethod)}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        {order.deliveryPartner ? (
                          <div>
                            <p className="font-medium">{order.deliveryPartner.name}</p>
                            <p className="text-xs text-ink-muted">{order.deliveryPartner.phone}</p>
                            {active && (
                              <button
                                onClick={() => setAssigning(order)}
                                className="text-xs font-medium text-primary-700 hover:underline"
                              >
                                Change
                              </button>
                            )}
                          </div>
                        ) : active ? (
                          <button onClick={() => setAssigning(order)} className="btn btn-secondary btn-sm">
                            <TruckIcon className="size-3.5" /> Assign
                          </button>
                        ) : (
                          <span className="text-ink-muted">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <OrderStatusBadge status={order.status} />
                          <RefundChip
                            order={order}
                            retrying={retryRefund.isPending && retryRefund.variables === order.id}
                            onRetry={() => retryRefund.mutate(order.id)}
                          />
                          {active && (
                            <select
                              value=""
                              disabled={updating}
                              onChange={(event) => handleStatusChange(order, event.target.value)}
                              aria-label={`Update status of order ${orderNumber(order.id)}`}
                              className="input w-auto py-1 text-xs"
                            >
                              <option value="">Update...</option>
                              {NEXT_STATUSES.filter((status) => status !== order.status).map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data && (
            <Pager
              page={data.page}
              pages={data.pages}
              onChange={setPage}
              className="border-t border-line px-5 py-3"
            />
          )}
        </section>
      )}

      {assigning && <AssignDialog order={assigning} onClose={() => setAssigning(null)} />}

      {pendingStatus && confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          description={confirmation.description}
          confirmLabel={confirmation.label}
          tone={confirmation.danger ? "danger" : "primary"}
          isPending={updateStatus.isPending}
          onConfirm={() =>
            updateStatus.mutate(
              { id: pendingStatus.order.id, status: pendingStatus.status },
              { onSuccess: () => setPendingStatus(null) },
            )
          }
          onCancel={() => setPendingStatus(null)}
        />
      )}
    </>
  );
}