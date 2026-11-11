// How an order is shared between the store wallet and a card or cash.
// It must match the API (server-nest/src/wallet/wallet-rules.ts): change both together.
// The API has the last word: this only makes the page show what the customer will really pay.
// Everything is counted in cents, so a sum with tiny binary errors never decides "covers everything"

// The smallest card payment Stripe takes in USD
export const MIN_CARD_PAYMENT = 0.5;

const toCents = (dollars: number) => Math.round(dollars * 100);
const toDollars = (cents: number) => cents / 100;

export interface PaymentSplit {
  /** What the wallet pays (dollars) */
  walletAmount: number;
  /** What is left for a card or for cash (dollars) */
  remaining: number;
  /** The wallet pays the whole order */
  coversAll: boolean;
}

export function splitPayment(
  total: number,
  balance: number,
  useWallet: boolean,
): PaymentSplit {
  const totalCents = Math.max(toCents(total), 0);
  const balanceCents = Math.max(toCents(balance), 0);
  const walletCents = useWallet ? Math.min(balanceCents, totalCents) : 0;
  const remainingCents = totalCents - walletCents;

  return {
    walletAmount: toDollars(walletCents),
    remaining: toDollars(remainingCents),
    coversAll: walletCents > 0 && remainingCents === 0,
  };
}

export const isBelowCardMinimum = (amount: number): boolean =>
  amount > 0 && toCents(amount) < toCents(MIN_CARD_PAYMENT);
