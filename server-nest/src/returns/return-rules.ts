// The rules of returns: pure functions, no database and no Nest
import { roundToCents } from '../orders/order-pricing.js';

// The days after delivery in which an order can be returned. The web app has the same number
// (storeInfo.returnDays): change both together
export const RETURN_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const RETURN_REASONS = [
  'DEFECTIVE',
  'WRONG_ITEM',
  'NOT_AS_DESCRIBED',
  'DOES_NOT_FIT',
  'OTHER',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  DEFECTIVE: 'Defective or damaged',
  WRONG_ITEM: 'Wrong item',
  NOT_AS_DESCRIBED: 'Not as described',
  DOES_NOT_FIT: 'Does not fit',
  OTHER: 'Other',
};

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

// A return in one of these statuses holds units of its order AND money: a new request cannot take them
export const ACTIVE_RETURN_STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'COMPLETED',
];

const NEXT: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const canMove = (from: ReturnStatus, to: ReturnStatus): boolean =>
  NEXT[from].includes(to);

// ---------- The lines of an order, and of a return ----------

// A type and not an interface: it has to fit the Json column of the database
export type ReturnLine = {
  product: string;
  variant: string | null;
  variantLabel: string | null;
  name: string;
  image: string;
  price: number;
  quantity: number;
};

// The same shirt in M and in L are two different lines
export const lineKey = (line: { product: string; variant?: string | null }) =>
  `${line.product}|${line.variant ?? ''}`;

// "Shirt (M / Black)": the name the customer knows the line by
export const lineName = (line: {
  name: string;
  variantLabel: string | null;
}) => (line.variantLabel ? `${line.name} (${line.variantLabel})` : line.name);

// The lines an order (or a return) stored as JSON, joined by (product, option).
// A line that does not look right is skipped: it must never break a request
export function parseLines(items: unknown): ReturnLine[] {
  if (!Array.isArray(items)) return [];

  const merged = new Map<string, ReturnLine>();
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as Record<string, unknown>;

    const { product, quantity, price } = entry;
    if (typeof product !== 'string') continue;
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    )
      continue;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
      continue;

    const variant =
      typeof entry.variant === 'string' && entry.variant ? entry.variant : null;
    const key = lineKey({ product, variant });

    const found = merged.get(key);
    if (found) {
      found.quantity += quantity;
      continue;
    }
    merged.set(key, {
      product,
      variant,
      variantLabel:
        typeof entry.variantLabel === 'string' && entry.variantLabel
          ? entry.variantLabel
          : null,
      name: typeof entry.name === 'string' ? entry.name : 'Product',
      image: typeof entry.image === 'string' ? entry.image : '',
      price,
      quantity,
    });
  }
  return [...merged.values()];
}

export type AvailableLine = Omit<ReturnLine, 'quantity'> & {
  ordered: number;
  returned: number; // held by returns that are still active
  available: number; // what a new return can still take
};

export function availableLines(
  orderLines: ReturnLine[],
  activeReturnItems: unknown[],
): AvailableLine[] {
  const returned = new Map<string, number>();
  for (const items of activeReturnItems) {
    for (const line of parseLines(items)) {
      const key = lineKey(line);
      returned.set(key, (returned.get(key) ?? 0) + line.quantity);
    }
  }

  return orderLines.map(({ quantity, ...rest }) => {
    const back = returned.get(lineKey(rest)) ?? 0;
    return {
      ...rest,
      ordered: quantity,
      returned: back,
      available: Math.max(quantity - back, 0),
    };
  });
}

// ---------- A new request ----------

export interface ReturnItemRequest {
  product: string;
  variant?: string | null;
  quantity: number;
}

export type ReturnPlan =
  | {
      ok: true;
      /** The lines of the return: the quantities that are being returned */
      lines: ReturnLine[];
      itemsValue: number;
      /** After this return, every unit of the order is in a return */
      completesOrder: boolean;
    }
  | { ok: false; message: string };

const refuse = (message: string): ReturnPlan => ({ ok: false, message });

// Checks what the customer asks for against what the order has left, and prices it
export function planReturn(
  orderLines: ReturnLine[],
  activeReturnItems: unknown[],
  wanted: ReturnItemRequest[],
): ReturnPlan {
  const lines = availableLines(orderLines, activeReturnItems);
  const byKey = new Map(lines.map((line) => [lineKey(line), line]));

  // The same item sent twice is one item with the sum
  const asked = new Map<string, number>();
  for (const item of wanted) {
    const key = lineKey({
      product: item.product,
      variant: item.variant || null,
    });
    asked.set(key, (asked.get(key) ?? 0) + item.quantity);
  }
  if (asked.size === 0) return refuse('Choose at least one item to return');

  const chosen: ReturnLine[] = [];
  for (const [key, quantity] of asked) {
    const line = byKey.get(key);
    if (!line) return refuse('One of the items is not in this order');
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return refuse('Quantity must be a whole number above 0');
    }
    if (quantity > line.available) {
      const name = lineName(line);
      return refuse(
        line.available > 0
          ? `Only ${line.available} of "${name}" can still be returned`
          : `"${name}" is already being returned`,
      );
    }
    chosen.push({
      product: line.product,
      variant: line.variant,
      variantLabel: line.variantLabel,
      name: line.name,
      image: line.image,
      price: line.price,
      quantity,
    });
  }

  const itemsValue = roundToCents(
    chosen.reduce((sum, line) => sum + line.price * line.quantity, 0),
  );
  const completesOrder = lines.every(
    (line) => line.available - (asked.get(lineKey(line)) ?? 0) === 0,
  );

  return { ok: true, lines: chosen, itemsValue, completesOrder };
}

// ---------- The days to return ----------

export type Eligibility =
  | { eligible: true; windowEndsAt: Date }
  | {
      eligible: false;
      code: 'NOT_DELIVERED' | 'NO_DELIVERY_DATE' | 'WINDOW_CLOSED';
      message: string;
      windowEndsAt: Date | null;
    };

export function checkEligibility(
  order: { status: string; deliveredAt: Date | null },
  now: Date,
): Eligibility {
  if (order.status !== 'Delivered') {
    return {
      eligible: false,
      code: 'NOT_DELIVERED',
      message: 'Only a delivered order can be returned',
      windowEndsAt: null,
    };
  }
  if (!order.deliveredAt) {
    return {
      eligible: false,
      code: 'NO_DELIVERY_DATE',
      message:
        'This order has no delivery date: please contact the store to return it',
      windowEndsAt: null,
    };
  }

  const windowEndsAt = new Date(
    order.deliveredAt.getTime() + RETURN_WINDOW_DAYS * DAY_MS,
  );
  if (now.getTime() > windowEndsAt.getTime()) {
    return {
      eligible: false,
      code: 'WINDOW_CLOSED',
      message: `The ${RETURN_WINDOW_DAYS} days to return this order have passed`,
      windowEndsAt,
    };
  }
  return { eligible: true, windowEndsAt };
}

// ---------- The money ----------

// What the customer gets back for a return. Delivery is not given back: what comes back is the items,
// with their share of the discount and of the tax. `reserved` = what the other active returns of the
// same order already hold. The return that takes the LAST units gets exactly what is left, so the
// returns of an order never add up to more than what was paid
export function calculateReturnRefund(input: {
  orderSubtotal: number;
  orderTotal: number;
  orderDeliveryFee: number | null;
  itemsValue: number;
  reserved: number;
  completesOrder: boolean;
}): number {
  const pool = Math.max(
    roundToCents(input.orderTotal - (input.orderDeliveryFee ?? 0)),
    0,
  );
  const left = Math.max(roundToCents(pool - input.reserved), 0);
  if (input.completesOrder) return left;

  const share =
    input.orderSubtotal > 0
      ? roundToCents((input.itemsValue / input.orderSubtotal) * pool)
      : 0;
  return Math.min(share, left);
}

// What Stripe says about a refund, in the words the app stores
export const refundStatusOf = (
  status: string | null | undefined,
): 'refunded' | 'pending' | 'failed' => {
  if (status === 'succeeded') return 'refunded';
  if (status === 'failed' || status === 'canceled') return 'failed';
  return 'pending'; // "pending", "requires_action"
};

// "#R-AB12CD34", "r-ab12" and "ab12" find the same return
export const cleanReturnSearch = (value: string | undefined): string =>
  (value ?? '').trim().replace(/^#/, '').replace(/^r-/i, '');
