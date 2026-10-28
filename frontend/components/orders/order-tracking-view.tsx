"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, Loader2Icon, PackageIcon, PhoneIcon, TriangleAlertIcon } from "lucide-react";
import toast from "react-hot-toast";
import LiveMap from "@/components/orders/live-map";
import { DeliveryAddressCard, OrderItemsCard } from "@/components/orders/order-details";
import OrderOtpCard from "@/components/orders/order-otp-card";
import OrderStatusBadge from "@/components/orders/order-status-badge";
import OrderTimeline from "@/components/orders/order-timeline";
import EmptyState from "@/components/ui/empty-state";
import PageLoader from "@/components/ui/page-loader";
import { useCart } from "@/context/cart-context";
import { getErrorStatus } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { awaitingPayment, canCustomerCancel, isActiveOrder, orderNumber, toMapPoint } from "@/lib/orders";
import { orderDetailOptions } from "@/lib/queries/orders";
import CancelOrderDialog from "@/components/orders/cancel-order-dialog";

const POLL_LIVE_MS = 10_000; // an order that is on its way: refresh the status and the location
const POLL_PAYMENT_MS = 2_000; // waiting for the payment confirmation
const PAYMENT_WAIT_MS = 60_000; // stop waiting after a minute

export default function OrderTrackingView({ id }: { id: string }) {
  const router = useRouter();
  const { clearCart } = useCart();
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const {
    data: order,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    ...orderDetailOptions(id),
    // One request gives the status, the location and the courier: poll it while the order
    // is still moving. A finished order (or an unreachable payment) stops the polling.
    refetchInterval: (query) => {
      const current = query.state.data;
      if (!current) return false;
      if (awaitingPayment(current)) return waitedTooLong ? false : POLL_PAYMENT_MS;
      return isActiveOrder(current) ? POLL_LIVE_MS : false;
    },
  });

  // Coming back from Stripe (?clearCart=true): the order is paid for, so empty the cart
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("clearCart") !== "true") return;
    clearCart();
    router.replace(`/orders/${id}`); // remove the parameter: a refresh must not clear the cart again
  }, [id, clearCart, router]);

  // Give up polling for the payment after a minute
  useEffect(() => {
    const timer = window.setTimeout(() => setWaitedTooLong(true), PAYMENT_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // Tell the customer the moment the payment is confirmed
  const wasAwaitingPayment = useRef(false);
  useEffect(() => {
    if (!order) return;
    const waiting = awaitingPayment(order);
    if (wasAwaitingPayment.current && !waiting) toast.success("Payment confirmed");
    wasAwaitingPayment.current = waiting;
  }, [order]);

  if (isPending) return <PageLoader />;

  if (isError || !order) {
    const notFound = getErrorStatus(error) === 404;


    return (
      <div className="container-page max-w-2xl py-16">
        <EmptyState
          icon={notFound ? PackageIcon : TriangleAlertIcon}
          title={notFound ? "Order not found" : "We couldn't load this order"}
          description={
            notFound ? "It may belong to another account, or it no longer exists." : undefined
          }
          action={
            notFound ? (
              <Link href="/orders" className="btn btn-primary">
                Go to my orders
              </Link>
            ) : (
              <button onClick={() => refetch()} className="btn btn-secondary">
                Try again
              </button>
            )
          }
        />
      </div>
    );
  }

  const waitingForPayment = awaitingPayment(order);
  const active = isActiveOrder(order);
  const destination = toMapPoint(order.shippingAddress);
  const livePoint = toMapPoint(order.liveLocation);
  const courier = livePoint && { ...livePoint, updatedAt: order.liveLocation?.updatedAt };


  return (
    <div className="container-page py-6">
      <Link
        href="/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> My orders
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Order {orderNumber(order.id)}</h1>
          <p className="mt-1 text-sm text-ink-muted">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={order.status} className="text-sm" />
      </div>

      {waitingForPayment && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-card border border-primary-100 bg-primary-50 p-4 text-sm text-primary-800"
        >
          {!waitedTooLong && <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin" />}
          <div className="flex-1">
            <p className="font-semibold">
              {waitedTooLong
                ? "We haven't received the payment confirmation yet"
                : "Confirming your payment..."}
            </p>
            <p className="mt-0.5 text-primary-800/80">
              {waitedTooLong
                ? "If you completed the payment, your order will be confirmed in a few minutes."
                : "This usually takes a few seconds. You can stay on this page."}
            </p>
            {waitedTooLong && (
              <button onClick={() => refetch()} className="btn btn-secondary btn-sm mt-3">
                Check again
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OrderOtpCard order={order} />

          {active && !waitingForPayment && <LiveMap destination={destination} courier={courier} />}

          <OrderTimeline order={order} />

          {order.deliveryPartner && active && (
            <section className="card flex items-center justify-between gap-3 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-700 font-semibold text-white">
                  {order.deliveryPartner.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold">{order.deliveryPartner.name}</p>
                  <p className="text-xs capitalize text-ink-muted">
                    {order.deliveryPartner.vehicleType ?? "Courier"} · Your courier
                  </p>
                </div>
              </div>
              <a
                href={`tel:${order.deliveryPartner.phone}`}
                className="btn btn-secondary p-2.5"
                aria-label={`Call ${order.deliveryPartner.name}`}
              >
                <PhoneIcon className="size-4" />
              </a>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <DeliveryAddressCard address={order.shippingAddress} />
          <OrderItemsCard order={order} />
          {canCustomerCancel(order) && (
            <section className="card p-5">
              <h2 className="text-sm font-semibold">Need to cancel?</h2>
              <p className="mt-1 text-xs text-ink-muted">
                You can cancel until the order is packed.
                {order.paymentMethod === "card" && " You get a full refund."}
              </p>
              <button
                onClick={() => setCancelling(true)}
                className="btn btn-secondary btn-sm mt-3 w-full hover:text-danger"
              >
                Cancel order
              </button>
            </section>
          )}
        </div>
      </div>
      {cancelling && <CancelOrderDialog order={order} onClose={() => setCancelling(false)} />}
    </div>
  );
}