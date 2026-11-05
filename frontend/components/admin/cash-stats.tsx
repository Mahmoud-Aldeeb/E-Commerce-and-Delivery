import { formatPrice } from "@/lib/format";
import type { CashBalance } from "@/lib/queries/cash";

interface CashStatsProps {
  balance: CashBalance;
  /** The name of the third number: "Still with couriers" for the whole store, "Still owed" for one courier */
  owedLabel: string;
}

export default function CashStats({ balance, owedLabel }: CashStatsProps) {
  const items = [
    { label: "Collected in cash", value: balance.collected, tone: "" },
    { label: "Handed over to the store", value: balance.settled, tone: "" },
    { label: owedLabel, value: balance.owed, tone: balance.owed > 0 ? "text-warning" : "" },
  ];

  return (
    <dl className="mb-6 grid gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="card p-5">
          <dt className="text-xs font-semibold uppercase text-ink-muted">{item.label}</dt>
          <dd className={`mt-1 text-2xl font-bold ${item.tone}`}>{formatPrice(item.value)}</dd>
        </div>
      ))}
    </dl>
  );
}