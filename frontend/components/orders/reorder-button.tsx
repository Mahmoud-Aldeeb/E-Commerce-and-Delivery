"use client";

import { Loader2Icon, RepeatIcon } from "lucide-react";
import { useReorder } from "@/lib/queries/reorder";
import type { Order } from "@/types";

export default function ReorderButton({
  order,
  className = "",
}: {
  order: Order;
  className?: string;
}) {
  const reorder = useReorder();

  return (
    <button
      onClick={() => reorder.mutate(order)}
      disabled={reorder.isPending}
      className={`btn btn-secondary ${className}`}
    >
      {reorder.isPending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <RepeatIcon className="size-4" />
      )}
      Order again
    </button>
  );
}