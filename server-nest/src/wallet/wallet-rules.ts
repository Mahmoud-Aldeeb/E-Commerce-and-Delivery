// The rules of the store wallet: pure functions, no database and no Nest

// Money in the wallet is whole CENTS (an integer): a balance that goes up and down many times must
// never collect the tiny errors of decimal numbers. Everywhere else in the app money is dollars
// rounded to cents, and the API speaks dollars: convert only at these two edges
export const toCents = (dollars: number): number => Math.round(dollars * 100);
export const toDollars = (cents: number): number => cents / 100;

export interface PaymentSplit {
  /** What the wallet pays, in dollars */
  walletAmount: number;
  /** What is left to pay by card or in cash, in dollars */
  remaining: number;
  /** The wallet pays the whole order: nothing is left for a card or for cash */
  coversAll: boolean;
}

// How an order is paid. The wallet is used only when the customer asks for it (`useWallet`), it pays
// as much as it can, and never more than the total. Everything is counted in cents
export function splitPayment(
  total: number,
  balanceCents: number,
  useWallet: boolean,
): PaymentSplit {
  const totalCents = Math.max(toCents(total), 0);
  const walletCents = useWallet
    ? Math.min(Math.max(balanceCents, 0), totalCents)
    : 0;
  const remainingCents = totalCents - walletCents;

  return {
    walletAmount: toDollars(walletCents),
    remaining: toDollars(remainingCents),
    coversAll: walletCents > 0 && remainingCents === 0,
  };
}

// The smallest card payment Stripe takes in USD is $0.50: a card part under it cannot be charged
export const MIN_CARD_PAYMENT = 0.5;

export const isBelowCardMinimum = (amount: number): boolean =>
  amount > 0 && toCents(amount) < toCents(MIN_CARD_PAYMENT);
