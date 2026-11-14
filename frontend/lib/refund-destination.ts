// The same rules as the API (server-nest/src/returns/return-rules.ts): change both together.
// The API has the last word: these only tell the customer what is wrong before the request is sent
const MOBILE = /^(?:\+?20|0020|0)?(1[0125]\d{8})$/;
const IPA = /^[a-z0-9][a-z0-9._-]{1,39}@[a-z][a-z0-9.-]{1,29}$/i;

// "+20 101 234 5678" becomes "01012345678". null when it is not an Egyptian mobile number
export function normalizeMobile(
  value: string | null | undefined,
): string | null {
  const match = MOBILE.exec((value ?? "").replace(/[\s-]/g, ""));
  return match ? `0${match[1]}` : null;
}

// An InstaPay address looks like name@instapay
export const isInstapayAddress = (value: string): boolean =>
  IPA.test(value.trim());
