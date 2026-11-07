"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ShoppingBagIcon } from "lucide-react";
import toast from "react-hot-toast";
import AddressStep from "@/components/checkout/address-step";
import CouponBox from "@/components/checkout/coupon-box";
import OrderSummary from "@/components/checkout/order-summary";
import PaymentStep from "@/components/checkout/payment-step";
import type { PaymentMethod } from "@/components/checkout/payment-methods";
import ReviewStep from "@/components/checkout/review-step";
import StepIndicator, { type Step } from "@/components/checkout/step-indicator";
import EmptyState from "@/components/ui/empty-state";
import PageLoader from "@/components/ui/page-loader";
import { useCart } from "@/context/cart-context";
import api, { getErrorMessage } from "@/lib/api";
import { calculateTotals } from "@/lib/pricing";
import { addressesOptions } from "@/lib/queries/addresses";
import { couponKeys, useCheckoutCoupon } from "@/lib/queries/coupons";
import { productKeys } from "@/lib/queries/products";
import type { CartItem, Order } from "@/types";
import { useAuth } from "@/context/auth-context";

// The API answers with { url } for card payments and { order } for the others
interface PlaceOrderResponse {
  url?: string | null;
  order?: Order;
}

export default function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    items,
    selectedItems,
    selectedCount,
    selectedTotal,
    removeOrderedItems,
    setIsCartOpen,
    isReady,
  } = useCart();
  const addressesQuery = useQuery(addressesOptions());
  const { user } = useAuth();
  const hasPhone = Boolean(user?.phone);
  // The discount of the coupon, worked out by the API for the items that are ticked right now
  const coupon = useCheckoutCoupon(selectedItems);

  const [step, setStep] = useState<Step>("address");
  const [chosenAddressId, setChosenAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  // Set right after a cash order: shows a loader instead of a flash of "empty cart"
  const [placed, setPlaced] = useState(false);

  // The address in use is derived, never copied in an effect: the chosen one,
  // else the default, else the first. A deleted address can never stay selected.
  const addresses = addressesQuery.data ?? [];
  const address =
    addresses.find((item) => item.id === chosenAddressId) ??
    addresses.find((item) => item.isDefault) ??
    addresses[0] ??
    null;

  // Only the ticked lines are ordered, so only they are priced
  const totals = calculateTotals(selectedTotal, coupon.discount);

  // A step opens only when the steps before it are complete
  const reachable: Record<Step, boolean> = {
    address: true,
    payment: Boolean(address) && hasPhone,
    review: Boolean(address) && hasPhone,
  };
  const activeStep: Step = reachable[step] ? step : "address";

  // An order is never placed while the coupon is being checked, or does not work:
  // the customer would pay a different amount than the one on the screen
  const orderBlockedReason =
    coupon.status === "checking"
      ? "Checking your coupon..."
      : coupon.status === "error"
        ? "Fix or remove the coupon to place your order."
        : null;

  const placeOrder = useMutation({
    // What is ordered is passed in (not read inside): it is exactly what is removed afterwards
    mutationFn: async ({
      orderItems,
      couponCode,
    }: {
      orderItems: CartItem[];
      couponCode: string | null;
    }) => {
      if (!address) throw new Error("No delivery address");

      const { data } = await api.post<PlaceOrderResponse>("/orders", {
        items: orderItems.map((item) => ({
          product: item.product.id,
          quantity: item.quantity,
          // A product with sizes/colours is ordered with the one that was chosen
          ...(item.variant ? { variant: item.variant.id } : {}),
        })), shippingAddress: {
          label: address.label,
          address: address.address,
          city: address.city,
          state: address.state,
          zip: address.zip,
          lat: address.lat,
          lng: address.lng,
        },
        paymentMethod,
        // Only the code goes: the API works the discount out again on its own
        ...(couponCode ? { couponCode } : {}),
      });
      return data;
    },
    onSuccess: (data, { orderItems }) => {
      // Card: the ordered products leave the cart later, when Stripe sends the customer back to
      // the order page. Until the browser leaves, the mutation stays "successful" and keeps the button disabled.
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      if (!data.order) return;

      setPlaced(true);
      removeOrderedItems(
        orderItems.map((item) => ({
          product: item.product.id,
          variant: item.variant?.id ?? null,
          quantity: item.quantity,
        })),
      );
      // Stock changed and there is a new order: cached lists are outdated
      queryClient.invalidateQueries({ queryKey: productKeys.all });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order placed!");
      router.replace(`/orders/${data.order.id}`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      // The coupon may be the reason (it expired, or its limit was reached): check it again
      queryClient.invalidateQueries({ queryKey: couponKeys.all });
    },
  });

  // Back from Stripe with the browser's back button, the page can come back from memory
  // exactly as it was left (button disabled): start fresh in that case
  const { reset } = placeOrder;
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reset();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reset]);

  const busy = placeOrder.isPending || placeOrder.isSuccess;

  if (placed || !isReady) return <PageLoader />;

  if (items.length === 0) {
    return (
      <div className="container-page max-w-2xl py-16">
        <EmptyState
          icon={ShoppingBagIcon}
          title="Your cart is empty"
          description="Add some products to check out."
          action={
            <Link href="/products" className="btn btn-primary">
              Browse products
            </Link>
          }
        />
      </div>
    );
  }

  // The cart has items, but none is ticked
  if (selectedItems.length === 0) {
    return (
      <div className="container-page max-w-2xl py-16">
        <EmptyState
          icon={ShoppingBagIcon}
          title="No items selected"
          description="Tick the items you want to buy in your cart."
          action={
            <button onClick={() => setIsCartOpen(true)} className="btn btn-primary">
              Open your cart
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" /> Continue shopping
      </Link>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Checkout</h1>

      <StepIndicator current={activeStep} reachable={reachable} onSelect={setStep} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {activeStep === "address" && (
            <AddressStep
              addresses={addresses}
              selectedId={address?.id ?? null}
              isPending={addressesQuery.isPending}
              isError={addressesQuery.isError}
              onRetry={() => addressesQuery.refetch()}
              onSelect={setChosenAddressId}
              onContinue={() => setStep("payment")}
            />
          )}

          {activeStep === "payment" && (
            <PaymentStep
              value={paymentMethod}
              onChange={setPaymentMethod}
              onBack={() => setStep("address")}
              onContinue={() => setStep("review")}
            />
          )}

          {activeStep === "review" && address && (
            <ReviewStep
              address={address}
              paymentMethod={paymentMethod}
              items={selectedItems}
              totals={totals}
              busy={busy}
              disabledReason={orderBlockedReason}
              onEdit={setStep}
              onBack={() => setStep("payment")}
              onPlaceOrder={() =>
                placeOrder.mutate({
                  orderItems: selectedItems,
                  couponCode: coupon.status === "applied" ? coupon.code : null,
                })
              }
            />
          )}
        </div>

        <OrderSummary
          itemCount={selectedCount}
          totals={totals}
          couponCode={coupon.discount > 0 ? coupon.code : null}
          leftInCart={items.length - selectedItems.length}
          onEditCart={() => setIsCartOpen(true)}
        >
          <CouponBox coupon={coupon} />
        </OrderSummary>
      </div>
    </div>
  );
}