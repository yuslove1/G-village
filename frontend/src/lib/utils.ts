import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Money arrives from the API already formatted: { kobo: "28500000",
 * display: "₦285,000" }. Render the display string and leave it alone.
 * Arithmetic on the client can only make a correct number wrong, and the
 * browser has no BigInt-safe path back to naira anyway.
 */
export interface Money {
  kobo: string;
  display: string;
}

/** Only for slider bounds and chart axes. Never for anything a user pays. */
export function koboToNairaApprox(kobo: string): number {
  return Number(BigInt(kobo) / 100n);
}

export const TIER_LABEL: Record<string, string> = {
  NEW: "New",
  UK_USED: "UK used",
  NG_USED: "Nigeria used",
};

export const GRADE_LABEL: Record<string, string> = {
  MINT: "Mint",
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  SOURCING: "Being sourced",
  READY: "Ready to send",
  IN_TRANSIT: "On the way",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function relativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

/** Counts down to a reservation expiry. Returns null once it has passed. */
export function timeLeft(until: string | Date | null): string | null {
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
