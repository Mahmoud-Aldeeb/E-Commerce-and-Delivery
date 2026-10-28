import { BanknoteIcon, CreditCardIcon, type LucideIcon } from "lucide-react";

// "card" starts a Stripe checkout; any other value places the order directly (see the API)
export type PaymentMethod = "card" | "cash";

export const PAYMENT_METHODS: {
  value: PaymentMethod;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    value: "card",
    label: "Credit or debit card",
    description:
      "Pay securely online. You will be taken to our payment partner, Stripe.",
    icon: CreditCardIcon,
  },
  {
    value: "cash",
    label: "Cash on delivery",
    description: "Pay the courier when your order arrives.",
    icon: BanknoteIcon,
  },
];
