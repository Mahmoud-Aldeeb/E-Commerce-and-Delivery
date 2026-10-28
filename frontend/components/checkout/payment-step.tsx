import { ChevronLeftIcon, ChevronRightIcon, CreditCardIcon } from "lucide-react";
import { PAYMENT_METHODS, type PaymentMethod } from "@/components/checkout/payment-methods";

interface PaymentStepProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function PaymentStep({ value, onChange, onBack, onContinue }: PaymentStepProps) {
  return (
    <section className="card animate-fade-in p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <CreditCardIcon className="size-5 text-primary-700" /> Payment method
      </h2>

      <fieldset>
        <legend className="sr-only">Choose how to pay</legend>
        <div className="space-y-3">
          {PAYMENT_METHODS.map((method) => {
            const selected = method.value === value;
            return (
              <label
                key={method.value}
                className={`flex cursor-pointer items-start gap-4 rounded-card border p-4 transition-colors focus-within:ring-2 focus-within:ring-primary-600/30 ${selected
                    ? "border-primary-600 bg-primary-50"
                    : "border-line hover:border-line-strong"
                  }`}
              >
                <input
                  type="radio"
                  name="payment-method"
                  className="mt-1 size-4 accent-primary-700"
                  checked={selected}
                  onChange={() => onChange(method.value)}
                />
                <method.icon className="mt-0.5 size-5 shrink-0 text-primary-700" />
                <span>
                  <span className="block text-sm font-semibold">{method.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{method.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

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