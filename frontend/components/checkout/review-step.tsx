import Image from "next/image";
import { CheckIcon, ChevronLeftIcon, Loader2Icon } from "lucide-react";
import { PAYMENT_METHODS, type PaymentMethod } from "@/components/checkout/payment-methods";
import type { Step } from "@/components/checkout/step-indicator";
import { formatAddress, formatPrice } from "@/lib/format";
import type { calculateTotals } from "@/lib/pricing";
import type { Address, CartItem } from "@/types";

interface ReviewStepProps {
  address: Address;
  paymentMethod: PaymentMethod;
  items: CartItem[];
  totals: ReturnType<typeof calculateTotals>;
  busy: boolean;
  onEdit: (step: Step) => void;
  onBack: () => void;
  onPlaceOrder: () => void;
}

export default function ReviewStep({
  address,
  paymentMethod,
  items,
  totals,
  busy,
  onEdit,
  onBack,
  onPlaceOrder,
}: ReviewStepProps) {
  const method = PAYMENT_METHODS.find((item) => item.value === paymentMethod);
  const isCard = paymentMethod === "card";

  return (
    <section className="card animate-fade-in p-6">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
        <CheckIcon className="size-5 text-primary-700" /> Review your order
      </h2>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-card bg-canvas p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Deliver to</h3>
            <button onClick={() => onEdit("address")} className="text-xs font-medium text-primary-700 hover:underline">
              Change
            </button>
          </div>
          <p className="text-sm text-ink-soft">
            <span className="font-medium text-ink">{address.label}</span>
            <br />
            {formatAddress(address)}
          </p>
        </div>

        <div className="rounded-card bg-canvas p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Payment</h3>
            <button onClick={() => onEdit("payment")} className="text-xs font-medium text-primary-700 hover:underline">
              Change
            </button>
          </div>
          <p className="text-sm text-ink-soft">{method?.label}</p>
        </div>
      </div>

      <ul className="mb-6 divide-y divide-line">
        {items.map((item) => (
          <li key={item.product.id} className="flex items-center gap-3 py-3">
            <Image
              src={item.product.image}
              alt={item.product.name}
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-control bg-canvas object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{item.product.name}</p>
              <p className="text-xs text-ink-muted">
                {item.quantity} × {formatPrice(item.product.price)}
              </p>
            </div>
            <span className="text-sm font-semibold">
              {formatPrice(item.product.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mb-4 text-xs text-ink-muted">
        When your order arrives, the courier will ask you for a one-time code. You will find it
        in your order details.
      </p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button onClick={onBack} disabled={busy} className="btn btn-secondary">
          <ChevronLeftIcon className="size-4" /> Back
        </button>
        <button onClick={onPlaceOrder} disabled={busy} className="btn btn-primary btn-lg">
          {busy && <Loader2Icon className="size-4 animate-spin" />}
          {busy
            ? isCard
              ? "Taking you to payment..."
              : "Placing your order..."
            : `Place order · ${formatPrice(totals.total)}`}
        </button>
      </div>
    </section>
  );
}