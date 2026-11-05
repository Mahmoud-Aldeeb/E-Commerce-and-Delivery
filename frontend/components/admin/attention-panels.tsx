"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";
import { formatStoreDateTime } from "@/lib/cash";
import { formatPrice } from "@/lib/format";
import { useRetryRefund } from "@/lib/queries/admin";
import type { Analytics, CancelledProduct, LowStockProduct, RefundItem } from "@/lib/queries/analytics";

// An order keeps the image of the day it was placed: it can be empty
function Thumb({ src, alt }: { src: string; alt: string }) {
  if (!src) return <span className="size-10 shrink-0 rounded-control bg-canvas" aria-hidden="true" />;
  return (
    <Image src={src} alt={alt} width={40} height={40} className="size-10 shrink-0 rounded-control bg-canvas object-cover" />
  );
}

function Panel({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        {badge}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

function AllGood({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft">
      <CheckCircle2Icon className="size-4 shrink-0 text-success" /> {text}
    </p>
  );
}

// ---------- Refunds ----------

const REFUND_TEXT: Record<RefundItem["kind"], string> = {
  missing: "The order was cancelled, but no refund was recorded.",
  failed: "The refund failed.",
  pending: "Still pending after more than a week. Check it in Stripe.",
};

function RefundRow({ item }: { item: RefundItem }) {
  const retry = useRetryRefund();
  // Pending: Stripe may already have refunded it, and a second try could be recorded as failed by mistake.
  // No payment id: there is nothing to refund automatically
  const canRetry = item.kind !== "pending" && item.paymentIntentId !== null;

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            <span className="font-mono">{item.number}</span> · {item.customer}
          </p>
          <p className="truncate text-xs text-ink-muted">{item.email}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold">{formatPrice(item.total)}</span>
      </div>

      <p className="mt-1 text-xs text-ink-soft">
        {REFUND_TEXT[item.kind]} Since {formatStoreDateTime(item.since)}.
      </p>
      {item.paymentIntentId === null ? (
        <p className="mt-1 text-xs text-warning">There is no payment id: refund it by hand in Stripe.</p>
      ) : (
        item.kind === "pending" && (
          <p className="mt-1 break-all font-mono text-xs text-ink-muted">{item.paymentIntentId}</p>
        )
      )}

      {canRetry && (
        <button
          onClick={() => retry.mutate(item.id)}
          disabled={retry.isPending}
          className="btn btn-secondary btn-sm mt-2"
        >
          {retry.isPending ? "Trying..." : "Retry the refund"}
        </button>
      )}
    </li>
  );
}

export function RefundsPanel({ refunds }: { refunds: Analytics["refunds"] }) {
  const { needsAction, stalePending, items } = refunds;
  const problems = needsAction.count + stalePending.count;

  return (
    <Panel
      title="Refunds that need attention"
      badge={
        problems > 0 ? (
          <span className="badge badge-danger">
            {problems} · {formatPrice(needsAction.amount + stalePending.amount)}
          </span>
        ) : undefined
      }
    >
      {problems === 0 ? (
        <AllGood text="Every refund went through." />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <RefundRow key={item.id} item={item} />
            ))}
          </ul>
          {problems > items.length && (
            <p className="mt-2 text-xs text-ink-muted">
              Showing the oldest {items.length} of {problems}.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

// ---------- Products running out ----------

function StockRow({ product }: { product: LowStockProduct }) {
  const out = product.stock === 0;

  return (
    <li className="flex items-center gap-3 py-3">
      <Thumb src={product.image} alt="" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/products/${product.id}/edit`}
          className="block truncate text-sm font-medium hover:text-primary-700"
        >
          {product.name}
        </Link>
        <p className="text-xs text-ink-soft">
          {product.soldInPeriod === 0
            ? "No sales in this period"
            : out
              ? `Sold ${product.soldInPeriod} in this period`
              : `Lasts about ${product.daysLeft} ${product.daysLeft === 1 ? "day" : "days"} at the current pace`}
        </p>
      </div>
      <span className={`badge shrink-0 ${out ? "badge-danger" : "badge-warning"}`}>
        {out ? "Out of stock" : `${product.stock} left`}
      </span>
    </li>
  );
}

export function LowStockPanel({ lowStock }: { lowStock: Analytics["lowStock"] }) {
  const { counts, products } = lowStock;

  return (
    <Panel
      title="Running out"
      badge={
        counts.low + counts.out > 0 ? (
          <span className="text-xs text-ink-muted">
            {counts.low} low · {counts.out} out
          </span>
        ) : undefined
      }
    >
      {products.length === 0 ? (
        <AllGood text="No product is running out." />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {products.map((product) => (
              <StockRow key={product.id} product={product} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            10 units or fewer. The products that sell come first.{" "}
            <Link href="/admin/products" className="font-medium text-primary-700 hover:underline">
              All products
            </Link>
          </p>
        </>
      )}
    </Panel>
  );
}

// ---------- Products in cancelled orders ----------

function CancelledRow({ product }: { product: CancelledProduct }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Thumb src={product.image} alt="" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/products/${product.productId}/edit`}
          className="block truncate text-sm font-medium hover:text-primary-700"
        >
          {product.name}
        </Link>
        <p className="text-xs text-ink-soft">
          In {product.cancelledOrders} cancelled orders · {product.cancelRate}% of the units ordered
        </p>
      </div>
      {product.flagged && <span className="badge badge-warning shrink-0">Check</span>}
    </li>
  );
}

export function CancelledPanel({ products }: { products: CancelledProduct[] }) {
  return (
    <Panel title="Products in cancelled orders">
      {products.length === 0 ? (
        <AllGood text="No product is in many cancelled orders." />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {products.map((product) => (
              <CancelledRow key={product.productId} product={product} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            A cancelled order is not always the fault of the product: the customer may have changed their mind.
            Look at a product marked Check (3 cancelled orders or more, a quarter of its units or more) for a pattern.
            Returns after delivery are not recorded here.
          </p>
        </>
      )}
    </Panel>
  );
}