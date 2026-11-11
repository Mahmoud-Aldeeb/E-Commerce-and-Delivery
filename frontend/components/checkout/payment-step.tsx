import { ChevronLeftIcon, ChevronRightIcon, CreditCardIcon, WalletIcon } from "lucide-react";
import { PAYMENT_METHODS, type PaymentMethod } from "@/components/checkout/payment-methods";
import { formatPrice } from "@/lib/format";
import { MIN_CARD_PAYMENT, type PaymentSplit } from "@/lib/payment";

interface PaymentStepProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** What the order costs: after the discount, with delivery and tax */
  total: number;
  /** What the store wallet holds. Nothing in it: the wallet is not offered */
  walletBalance: number;
  useWallet: boolean;
  onUseWalletChange: (use: boolean) => void;
  /** How the wallet and the rest share the total, worked out by the page */
  split: PaymentSplit;
  /** The rest is under the smallest card payment */
  cardTooSmall: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export default function PaymentStep({
  value,
  onChange,
  total,
  walletBalance,
  useWallet,
  onUseWalletChange,
  split,
  cardTooSmall,
  onBack,
  onContinue,
}: PaymentStepProps) {
  const { walletAmount, remaining, coversAll } = split;
  const enough = Math.round(walletBalance * 100) >= Math.round(total * 100);

  const walletHint = useWallet
    ? coversAll
      ? "Your wallet pays the whole order. Nothing is left to pay."
      : `Your wallet pays ${formatPrice(walletAmount)}. Choose below how to pay the other ${formatPrice(remaining)}.`
    : enough
      ? "Enough to pay this whole order."
      : "It pays a part of this order, and you pay the rest.";

  return (
    <section className="card animate-fade-in p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <CreditCardIcon className="size-5 text-primary-700" /> Payment method
      </h2>

      {/* The wallet is offered only when it holds something, and it is always the customer's choice */}
      {walletBalance > 0 && (
        <label
          className={`mb-4 flex cursor-pointer items-start gap-4 rounded-card border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${useWallet ? "border-primary-600 bg-primary-50" : "border-line hover:border-line-strong"
            }`}
        >
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary-700"
            checked={useWallet}
            onChange={(event) => onUseWalletChange(event.target.checked)}
          />
          <WalletIcon className="mt-0.5 size-5 shrink-0 text-primary-700" />
          <span>
            <span className="block text-sm font-semibold">
              Use my wallet balance ({formatPrice(walletBalance)})
            </span>
            <span className="mt-0.5 block text-xs text-ink-soft">{walletHint}</span>
          </span>
        </label>
      )}

      <fieldset disabled={coversAll} className={coversAll ? "opacity-60" : ""}>
        <legend className="sr-only">Choose how to pay</legend>
        <div className="space-y-3">
          {PAYMENT_METHODS.map((method) => {
            const tooSmall = method.value === "card" && cardTooSmall;
            const selected = !coversAll && method.value === value;
            const description = tooSmall
              ? `The rest (${formatPrice(remaining)}) is too small for a card: a card payment must be ${formatPrice(MIN_CARD_PAYMENT)} or more. Pay it in cash, or turn the wallet off.`
              : method.description;

            return (
              <label
                key={method.value}
                className={`flex items-start gap-4 rounded-card border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${tooSmall || coversAll ? "cursor-not-allowed" : "cursor-pointer"
                  } ${tooSmall ? "opacity-60" : ""} ${selected ? "border-primary-600 bg-primary-50" : "border-line hover:border-line-strong"
                  }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  className="mt-1 size-4 accent-primary-700"
                  checked={selected}
                  disabled={tooSmall}
                  onChange={() => onChange(method.value)}
                />
                <method.icon className="mt-0.5 size-5 shrink-0 text-primary-700" />
                <span>
                  <span className="block text-sm font-semibold">{method.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {coversAll && (
        <p className="mt-3 text-xs text-ink-muted">
          Nothing is left to pay, so you do not need a payment method.
        </p>
      )}

      <div className="mt-6 flex justify-between gap-3">
        <button onClick={onBack} className="btn btn-secondary">
          <ChevronLeftIcon className="size-4" /> Back
        </button>
        <button onClick={onContinue} className="btn btn-primary btn-lg">
          Review order <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </section>
  );
}