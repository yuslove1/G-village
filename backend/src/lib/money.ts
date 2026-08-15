/**
 * Money in Gadgetvillage is a BigInt count of kobo. Never a number, never a
 * float, never a string that gets parsed twice.
 *
 * The reason is boring and well known: 0.1 + 0.2 !== 0.3 in binary floating
 * point. On a ₦285,000 phone that error is invisible. Across ten thousand
 * orders and a commission split it is a reconciliation nightmare, and the
 * person who eats it is whoever owns the bank account.
 */

export type Kobo = bigint;

export const KOBO_PER_NAIRA = 100n;

export function naira(amount: number | string): Kobo {
  const s = String(amount).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Not a naira amount: ${amount}`);
  }
  const negative = s.startsWith("-");
  // The regex above already guarantees at least one leading digit, so
  // `whole` can never actually be undefined here — noUncheckedIndexedAccess
  // just cannot see that from the split() call alone.
  const [whole, fraction = ""] = s.replace("-", "").split(".");
  const padded = (fraction + "00").slice(0, 2);
  const total = BigInt(whole!) * KOBO_PER_NAIRA + BigInt(padded);
  return negative ? -total : total;
}

/** For display only. Never feed the result back into a calculation. */
export function formatNaira(kobo: Kobo, opts: { decimals?: boolean } = {}): string {
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const whole = abs / KOBO_PER_NAIRA;
  const rest = abs % KOBO_PER_NAIRA;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = opts.decimals ? `.${rest.toString().padStart(2, "0")}` : "";
  return `${negative ? "-" : ""}\u20a6${grouped}${tail}`;
}

/**
 * Percentage in basis points. 1500 bps = 15%.
 *
 * Rounds half up on the absolute value, so a 15% commission on ₦248,001
 * does not quietly round in the platform's favour every single time.
 */
export function applyBps(kobo: Kobo, bps: number): Kobo {
  if (!Number.isInteger(bps) || bps < 0) throw new Error(`Bad bps: ${bps}`);
  const negative = kobo < 0n;
  const abs = negative ? -kobo : kobo;
  const numerator = abs * BigInt(bps);
  const quotient = numerator / 10000n;
  const remainder = numerator % 10000n;
  const rounded = remainder * 2n >= 10000n ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Percent of a value where percent may be fractional, e.g. 12.5. */
export function applyPercent(kobo: Kobo, percent: number): Kobo {
  return applyBps(kobo, Math.round(percent * 100));
}

export function sum(amounts: Kobo[]): Kobo {
  return amounts.reduce<bigint>((acc, k) => acc + k, 0n);
}

export function assertNonNegative(kobo: Kobo, label = "amount"): Kobo {
  if (kobo < 0n) throw new Error(`${label} cannot be negative`);
  return kobo;
}

/**
 * Splits an amount across n parties without losing a single kobo.
 * The remainder goes to the earliest weights in order, so the sum of the
 * parts always equals the whole.
 */
export function splitKobo(total: Kobo, weights: number[]): Kobo[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error("Weights must sum above zero");

  const parts = weights.map((w) => (total * BigInt(Math.round(w * 1e6))) / BigInt(Math.round(totalWeight * 1e6)));
  let allocated = sum(parts);
  let i = 0;
  while (allocated < total) {
    parts[i % parts.length] = (parts[i % parts.length] ?? 0n) + 1n;
    allocated += 1n;
    i++;
  }
  return parts;
}

/** JSON.stringify cannot serialise BigInt. Use this at the response edge. */
export function koboToString(kobo: Kobo): string {
  return kobo.toString();
}
