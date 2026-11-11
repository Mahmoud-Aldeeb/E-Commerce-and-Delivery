import { CreditCardIcon } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Order } from "@/types";

// Shown on a cancelled order that was paid (by card, or from the store wallet): says where the money is
export default function RefundNotice({ order }: { order: Order }) {
  const wallet = order.walletAmountUsed ?? 0;
  const cardPaid = order.paymentMethod === "card" && order.isPaid;
  if (!cardPaid && wallet <= 0) return null;

  const cardAmount = formatPrice(Math.round((order.total - wallet) * 100) / 100);
  const cardText = !cardPaid
    ? null
    : order.refundStatus === "refunded"
      ? `${cardAmount} was returned to your card. Banks usually take 5 to 10 business days to show it.`
      : order.refundStatus === "pending"
        ? `Your refund of ${cardAmount} is being processed.`
        : `Your refund of ${cardAmount} is being reviewed by our team. You do not need to do anything.`;
  const walletText = wallet > 0 ? `${formatPrice(wallet)} went back to your store wallet.` : null;

  return (
    <div role="status" className="flex items-start gap-3 rounded-control bg-canvas p-3 text-sm text-ink-soft">
      <CreditCardIcon className="mt-0.5 size-4 shrink-0 text-primary-700" />
      <div>
        <p className="font-medium text-ink">
          {cardPaid && order.refundStatus !== "refunded" ? "Refund on its way" : "Refund issued"}
        </p>
        {walletText && <p className="mt-0.5">{walletText}</p>}
        {cardText && <p className="mt-0.5">{cardText}</p>}
      </div>
    </div>
  );
}