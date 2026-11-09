import Image from "next/image";
import { formatPrice } from "@/lib/format";
import type { ReturnLine } from "@/types";

// The items of a return: used by the customer page and by the admin list
export default function ReturnItems({ items }: { items: ReturnLine[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li key={`${item.product}-${item.variant ?? ""}-${index}`} className="flex items-center gap-3">
          {/* An item keeps the image of the day it was ordered: it can be empty */}
          {item.image ? (
            <Image
              src={item.image}
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-control bg-canvas object-cover"
            />
          ) : (
            <span className="size-10 shrink-0 rounded-control bg-canvas" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <p className="text-xs text-ink-muted">
              {item.variantLabel ? `${item.variantLabel} · ` : ""}
              {item.quantity} × {formatPrice(item.price)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}