import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import type { Kobo } from "./money.js";

const BASE = "https://api.paystack.co";

/**
 * Paystack signs every webhook with HMAC SHA-512 over the raw request body,
 * keyed with the secret key. Three things go wrong with this in practice and
 * all three are avoided here.
 *
 * One: verifying against a re-serialised body. JSON.stringify(JSON.parse(x))
 * is not always x, so the route must hand us the raw Buffer.
 * Two: comparing with ===, which leaks the signature a byte at a time.
 * Three: trusting the amount in the payload. The webhook is a claim. Before
 * anything is marked paid we call verifyTransaction and use that number.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Paystack's published source IPs. Secondary control only. Signature
 * verification stays the gate, because IP lists go stale and proxies lie.
 */
export const PAYSTACK_IPS = ["52.31.139.75", "52.49.173.169", "52.214.14.220"];

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

async function call<T>(path: string, init?: RequestInit): Promise<PaystackResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => null)) as PaystackResponse<T> | null;

  if (!res.ok || !body?.status) {
    logger.error({ path, status: res.status, message: body?.message }, "paystack call failed");
    throw new Error(body?.message ?? `Paystack returned ${res.status}`);
  }
  return body;
}

export interface InitTransactionArgs {
  email: string;
  amountKobo: Kobo;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: Array<"card" | "bank_transfer" | "ussd" | "bank">;
}

export async function initTransaction(args: InitTransactionArgs) {
  const { data } = await call<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: args.email,
        amount: args.amountKobo.toString(), // kobo, as a string, never a float
        reference: args.reference,
        callback_url: args.callbackUrl,
        metadata: args.metadata,
        channels: args.channels ?? ["card", "bank_transfer", "ussd"],
        currency: "NGN",
      }),
    },
  );
  return data;
}

export interface VerifiedTransaction {
  status: string;      // "success" is the only one that means paid
  reference: string;
  amountKobo: Kobo;
  channel: string;
  paidAt: Date | null;
  feesKobo: Kobo;
  raw: unknown;
}

/**
 * The authoritative check. Called before any order moves to PAID, whether the
 * signal came from a webhook or the browser callback.
 */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const { data } = await call<{
    status: string;
    reference: string;
    amount: number;
    channel: string;
    paid_at: string | null;
    fees: number | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  return {
    status: data.status,
    reference: data.reference,
    amountKobo: BigInt(data.amount),
    channel: data.channel,
    paidAt: data.paid_at ? new Date(data.paid_at) : null,
    feesKobo: BigInt(data.fees ?? 0),
    raw: data,
  };
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  const { data } = await call<{ account_number: string; account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
  return data;
}

export async function listBanks() {
  const { data } = await call<Array<{ name: string; code: string; slug: string }>>(
    "/bank?country=nigeria&currency=NGN",
  );
  return data;
}
