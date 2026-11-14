"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownRightIcon, ArrowUpRightIcon, TriangleAlertIcon, WalletIcon } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import Pager from "@/components/ui/pager";
import { formatDateTime, formatPrice } from "@/lib/format";
import { orderNumber } from "@/lib/orders";
import { walletOptions, type WalletTransaction } from "@/lib/queries/wallet";

const TYPE_TEXT: Record<WalletTransaction["type"], string> = {
  RETURN_REFUND: "Refund of a return",
  ORDER_PAYMENT: "Paid for an order",
  ORDER_REFUND: "Refund of a cancelled order",
};

export default function WalletView() {
  const [page, setPage] = useState(1);

  const { data, isPending, isError, isPlaceholderData, refetch } = useQuery({
    ...walletOptions(page),
    // Keep showing the previous page while the next one loads: no flash of skeletons
    placeholderData: keepPreviousData,
  });

  const transactions = data?.transactions ?? [];

  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="text-2xl font-bold tracking-tight">My wallet</h1>

      {isError ? (
        <div className="mt-6">
          <EmptyState
            icon={TriangleAlertIcon}
            title="We couldn't load your wallet"
            description="Check your connection and try again. If you are signed out, sign in first."
            action={
              <div className="flex gap-2">
                <button onClick={() => refetch()} className="btn btn-secondary">
                  Try again
                </button>
                <Link href="/login?redirect=/wallet" className="btn btn-primary">
                  Sign in
                </Link>
              </div>
            }
          />
        </div>
      ) : isPending ? (
        <div className="mt-6 space-y-3" aria-busy="true">
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      ) : (
        <>
          <section className="card mt-6 flex flex-wrap items-center justify-between gap-4 p-6" aria-label="Balance">
            <div className="flex items-center gap-4">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                <WalletIcon className="size-6" />
              </span>
              <div>
                <p className="text-sm text-ink-muted">Store wallet balance</p>
                <p className="text-3xl font-bold tracking-tight">{formatPrice(data.balance)}</p>
              </div>
            </div>
            <p className="max-w-xs text-sm text-ink-soft">
              It grows when a return is refunded to your wallet. At checkout you choose whether to use it: it is
              never used without your choice.
            </p>
          </section>

          <h2 className="mb-3 mt-8 text-lg font-semibold">History</h2>

          {transactions.length === 0 ? (
            <EmptyState
              icon={WalletIcon}
              title="No wallet activity yet"
              description="Your balance grows when a refund is sent to your wallet, and shrinks when you pay with it."
              action={
                <Link href="/orders" className="btn btn-primary">
                  View my orders
                </Link>
              }
            />
          ) : (
            <>
              <ul className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                {transactions.map((transaction) => {
                  const credit = transaction.amount > 0;

                  return (
                    <li key={transaction.id} className="card flex items-center gap-4 p-4">
                      <span
                        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${credit ? "bg-success-soft text-success" : "bg-canvas text-ink-soft"
                          }`}
                        aria-hidden="true"
                      >
                        {credit ? <ArrowUpRightIcon className="size-5" /> : <ArrowDownRightIcon className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{TYPE_TEXT[transaction.type]}</p>
                        <p className="text-xs text-ink-muted">
                          {formatDateTime(transaction.createdAt)}
                          {transaction.orderId && (
                            <>
                              {" · "}
                              <Link
                                href={`/orders/${transaction.orderId}`}
                                className="font-medium text-primary-700 hover:underline"
                              >
                                Order {orderNumber(transaction.orderId)}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${credit ? "text-success" : ""}`}>
                          {credit ? "+" : "-"}
                          {formatPrice(Math.abs(transaction.amount))}
                        </p>
                        <p className="text-xs text-ink-muted">Balance {formatPrice(transaction.balanceAfter)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pager page={data.page} pages={data.pages} onChange={setPage} className="mt-6" />
            </>
          )}
        </>
      )}
    </div>
  );
}