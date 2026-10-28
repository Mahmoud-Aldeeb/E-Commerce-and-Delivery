import { KeyRoundIcon } from "lucide-react";
import { OTP_STATUSES } from "@/lib/orders";
import type { Order } from "@/types";

export default function OrderOtpCard({ order }: { order: Order }) {
  // The API sends the code only to the customer who placed the order
  if (!order.deliveryOtp || !OTP_STATUSES.includes(order.status)) return null;

  const digits = order.deliveryOtp.split("");

  return (
    <section className="rounded-card bg-primary-700 p-6 text-white">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-white/15">
          <KeyRoundIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">Your delivery code</h2>
          <p className="text-xs text-white/75">
            Give it to the courier only when your order is at your door.
          </p>
        </div>
      </div>

      {/* Read aloud as separate digits; the boxes below are only visual */}
      <p className="sr-only">Delivery code: {digits.join(" ")}</p>
      <div className="mt-4 flex gap-2" aria-hidden="true">
        {digits.map((digit, index) => (
          <span
            key={index}
            className="flex h-14 w-11 items-center justify-center rounded-control bg-white/15 font-mono text-2xl font-bold"
          >
            {digit}
          </span>
        ))}
      </div>
    </section>
  );
}