/**
 * BigInt does not survive JSON.stringify. Rather than patching the global
 * prototype, which is a trap that bites in unrelated places, every response
 * shape is built explicitly through these helpers.
 */
import { formatNaira } from "./money.js";

export interface MoneyDto {
  kobo: string;
  display: string;
}

export function money(kobo: bigint): MoneyDto {
  return { kobo: kobo.toString(), display: formatNaira(kobo) };
}

export function maybeMoney(kobo: bigint | null | undefined): MoneyDto | null {
  return kobo == null ? null : money(kobo);
}
