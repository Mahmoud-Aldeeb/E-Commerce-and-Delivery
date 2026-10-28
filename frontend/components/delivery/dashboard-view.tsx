"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { NavigationIcon, PackageIcon, TriangleAlertIcon } from "lucide-react";
import toast from "react-hot-toast";
import CancelDialog from "@/components/delivery/cancel-dialog";
import DeliveryCard from "@/components/delivery/delivery-card";
import OtpDialog from "@/components/delivery/otp-dialog";
import EmptyState from "@/components/ui/empty-state";
import Pager from "@/components/ui/pager";
import {
  activeDeliveriesOptions,
  completedDeliveriesOptions,
  useAdvanceDelivery,
  type DeliveryTab,
} from "@/lib/queries/delivery";
import { useLocationSharing } from "@/lib/use-location-sharing";
import type { Order } from "@/types";

const timeFormat = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

const NEXT_STATUS: Record<string, string> = {
  Assigned: "Packed",
  Packed: "Out for Delivery",
};

const EMPTY: Record<DeliveryTab, { title: string; description: string }> = {
  active: { title: "No active deliveries", description: "New assignments appear here by themselves." },
  completed: { title: "No completed deliveries", description: "Delivered and cancelled orders show here." },
};

export default function DashboardView() {
  const [tab, setTab] = useState<DeliveryTab>("active");
  const [completedPage, setCompletedPage] = useState(1);
  const [sharing, setSharing] = useState(false);
  const [deliverTarget, setDeliverTarget] = useState<Order | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  // The active list is always loaded and refreshed: a new assignment shows up without a reload,
  // and the location sharing needs it even while the "Completed" tab is open
  const active = useQuery({ ...activeDeliveriesOptions(), refetchInterval: 15_000 });
  const completed = useQuery({
    ...completedDeliveriesOptions(completedPage),
    enabled: tab === "completed",
    // Keep showing the previous page while the next one loads
    placeholderData: keepPreviousData,
  });

  const isActiveTab = tab === "active";
  const current = isActiveTab ? active : completed;
  const orders = isActiveTab ? (active.data ?? []) : (completed.data?.orders ?? []);
  const retry = () => (isActiveTab ? active.refetch() : completed.refetch());
  // There are finished orders, but the requested page is past the last one
  const pastLastPage = Boolean(
    !isActiveTab && completed.data && orders.length === 0 && completed.data.total > 0,
  );

  const advance = useAdvanceDelivery();
  const busyId = advance.isPending ? advance.variables?.id : undefined;

  const activeOrders = active.data ?? [];
  const { lastSentAt } = useLocationSharing({
    enabled: sharing,
    orderIds: activeOrders.map((order) => order.id),
    onStop: (message) => {
      setSharing(false);
      toast.error(message);
    },
  });

  function toggleSharing() {
    if (!sharing && !navigator.geolocation) {
      toast.error("Your browser does not support location.");
      return;
    }
    setSharing((value) => !value);
  }

  function goToPage(next: number) {
    setCompletedPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">My deliveries</h1>

      <div className="mb-5 flex gap-2" role="group" aria-label="Filter deliveries">
        {(["active", "completed"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${tab === key ? "bg-primary-700 text-white" : "bg-surface text-ink-soft ring-1 ring-line hover:bg-canvas"
              }`}
          >
            {key === "active" ? "Active" : "Completed"}
            {key === "active" && active.data && <span className="ml-1.5 opacity-70">{active.data.length}</span>}
          </button>
        ))}
      </div>

      {(activeOrders.length > 0 || sharing) && (
        <section className="card mb-5 flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${sharing ? "bg-success-soft text-success" : "bg-canvas text-ink-muted"
                }`}
            >
              <NavigationIcon className={`size-5 ${sharing ? "animate-pulse" : ""}`} />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {sharing ? "Sharing your location" : "Location sharing is off"}
              </p>
              <p className="text-xs text-ink-muted">
                {sharing
                  ? lastSentAt
                    ? `Last update ${timeFormat.format(lastSentAt)}`
                    : "Waiting for GPS..."
                  : "Turn it on so customers can follow their orders."}
              </p>
            </div>
          </div>
          <button
            onClick={toggleSharing}
            aria-pressed={sharing}
            className={`btn btn-sm shrink-0 ${sharing ? "btn-secondary" : "btn-primary"}`}
          >
            {sharing ? "Stop" : "Start sharing"}
          </button>
        </section>
      )}

      {current.isPending ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((item) => (
            <div key={item} className="skeleton h-56 w-full" />
          ))}
        </div>
      ) : current.isError ? (
        <EmptyState
          icon={TriangleAlertIcon}
          title="We couldn't load your deliveries"
          action={
            <button onClick={() => void retry()} className="btn btn-secondary">
              Try again
            </button>
          }
        />
      ) : pastLastPage ? (
        <EmptyState
          icon={PackageIcon}
          title="There is nothing on this page"
          action={
            <button onClick={() => setCompletedPage(1)} className="btn btn-secondary">
              Go to the first page
            </button>
          }
        />
      ) : orders.length === 0 ? (
        <EmptyState icon={PackageIcon} title={EMPTY[tab].title} description={EMPTY[tab].description} />
      ) : (
        <>
          <ul className={`space-y-4 transition-opacity ${!isActiveTab && completed.isPlaceholderData ? "opacity-60" : ""}`}>
            {orders.map((order) => (
              <li key={order.id}>
                <DeliveryCard
                  order={order}
                  tab={tab}
                  busy={busyId === order.id}
                  onAdvance={(target) => {
                    const status = NEXT_STATUS[target.status];
                    if (status) advance.mutate({ id: target.id, status });
                  }}
                  onDeliver={setDeliverTarget}
                  onCancel={setCancelTarget}
                />
              </li>
            ))}
          </ul>
          {!isActiveTab && completed.data && (
            <Pager
              page={completed.data.page}
              pages={completed.data.pages}
              onChange={goToPage}
              className="mt-6"
            />
          )}
        </>
      )}

      {deliverTarget && <OtpDialog order={deliverTarget} onClose={() => setDeliverTarget(null)} />}
      {cancelTarget && <CancelDialog order={cancelTarget} onClose={() => setCancelTarget(null)} />}
    </>
  );
}