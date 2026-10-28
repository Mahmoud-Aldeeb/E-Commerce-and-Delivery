import { CreditCardIcon } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Order } from "@/types";

// Shown on a cancelled order that was paid by card: says where the money is
export default function RefundNotice({ order }: { order: Order }) {
  if (order.paymentMethod !== "card" || !order.isPaid) return null;

  const amount = formatPrice(order.total);
  const text =
    order.refundStatus === "refunded"
      ? `${amount} was returned to your card. Banks usually take 5 to 10 business days to show it.`
      : order.refundStatus === "pending"
        ? `Your refund of ${amount} is being processed.`
        : `Your refund of ${amount} is being reviewed by our team. You do not need to do anything.`;

  return (
    <div role="status" className="flex items-start gap-3 rounded-control bg-canvas p-3 text-sm text-ink-soft">
      <CreditCardIcon className="mt-0.5 size-4 shrink-0 text-primary-700" />
      <div>
        <p className="font-medium text-ink">
          {order.refundStatus === "refunded" ? "Refund issued" : "Refund on its way"}
        </p>
        <p className="mt-0.5">{text}</p>
      </div>
    </div>
  );
}