import { formatDayKey, formatShortDay } from "@/lib/cash";
import { formatPrice } from "@/lib/format";
import type { DailySales } from "@/lib/queries/analytics";

const orders = (count: number) => `${count} ${count === 1 ? "order" : "orders"}`;

// Bars drawn with plain CSS: no chart library. The exact numbers are in the table below the bars
export default function SalesChart({ days }: { days: DailySales[] }) {
  const first = days[0];
  const last = days[days.length - 1];
  const max = Math.max(...days.map((day) => day.revenue), 0);

  if (!first || !last || max === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">No sales in this period.</p>;
  }

  return (
    <div>
      <div
        role="img"
        aria-label={`Daily sales from ${formatDayKey(first.date)} to ${formatDayKey(last.date)}. The best day made ${formatPrice(max)}.`}
        className="flex h-44 items-end gap-px"
      >
        {days.map((day) => (
          <div
            key={day.date}
            title={`${formatDayKey(day.date)}: ${formatPrice(day.revenue)} from ${orders(day.orders)}`}
            className="flex h-full flex-1 items-end"
          >
            <div
              className={`w-full rounded-t ${day.revenue > 0 ? "bg-primary-600" : "bg-line"}`}
              style={{ height: day.revenue > 0 ? `${Math.max(4, (day.revenue / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1 flex justify-between text-xs text-ink-muted">
        <span>{formatShortDay(first.date)}</span>
        <span>Best day: {formatPrice(max)}</span>
        <span>{formatShortDay(last.date)}</span>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-primary-700">Show the numbers</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-control border border-line">
          <table className="w-full whitespace-nowrap text-left">
            <thead className="sticky top-0 bg-canvas text-xs uppercase text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">Day</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Orders</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Revenue</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Discounts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...days].reverse().map((day) => (
                <tr key={day.date}>
                  <td className="px-4 py-2">{formatDayKey(day.date)}</td>
                  <td className="px-4 py-2 text-right">{day.orders}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatPrice(day.revenue)}</td>
                  <td className="px-4 py-2 text-right text-ink-soft">{formatPrice(day.discount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}