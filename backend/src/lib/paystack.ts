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

export interface CardAuthorization {
  authorizationCode: string;
  last4: string;
  expMonth: string;
  expYear: string;
  cardType: string;
  bank: string | null;
  reusable: boolean;
}

export interface VerifiedTransaction {
  status: string;      // "success" is the only one that means paid
  reference: string;
  amountKobo: Kobo;
  channel: string;
  paidAt: Date | null;
  feesKobo: Kobo;
  // Present on card transactions only. Paystack returns this shape on every
  // charge, but authorization_code is only ever safe to store for future use
  // when reusable is true — some banks issue single-use authorizations.
  authorization: CardAuthorization | null;
  raw: unknown;
}

interface PaystackAuthorizationPayload {
  authorization_code: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  card_type: string;
  bank: string | null;
  reusable: boolean;
}

function parseAuthorization(a: PaystackAuthorizationPayload | null | undefined): CardAuthorization | null {
  if (!a?.authorization_code) return null;
  return {
    authorizationCode: a.authorization_code,
    last4: a.last4,
    expMonth: a.exp_month,
    expYear: a.exp_year,
    cardType: a.card_type,
    bank: a.bank,
    reusable: a.reusable,
  };
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
    authorization?: PaystackAuthorizationPayload;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  return {
    status: data.status,
    reference: data.reference,
    amountKobo: BigInt(data.amount),
    channel: data.channel,
    paidAt: data.paid_at ? new Date(data.paid_at) : null,
    feesKobo: BigInt(data.fees ?? 0),
    authorization: parseAuthorization(data.authorization),
    raw: data,
  };
}

/**
 * Charges a previously-saved card directly — no redirect, no hosted page.
 * Still not trusted on its own: the caller re-runs verifyTransaction() before
 * marking anything paid, same as every other payment path in this app. This
 * call only decides whether there is a redirect to send the browser to.
 */
export async function chargeAuthorization(args: {
  email: string;
  amountKobo: Kobo;
  authorizationCode: string;
  reference: string;
}): Promise<{ status: string; reference: string }> {
  const { data } = await call<{ status: string; reference: string }>(
    "/transaction/charge_authorization",
    {
      method: "POST",
      body: JSON.stringify({
        email: args.email,
        amount: args.amountKobo.toString(),
        authorization_code: args.authorizationCode,
        reference: args.reference,
        currency: "NGN",
      }),
    },
  );
  return data;
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

/**
 * Registers a payout destination with Paystack and gets back a recipient
 * code, the only thing initiateTransfer needs. Done once, at the moment a
 * seller adds the account (see payout.routes.ts) — not stored ourselves is
 * the underlying account number, only what Paystack hands back.
 */
export async function createTransferRecipient(args: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<{ recipientCode: string }> {
  const { data } = await call<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: args.name,
      account_number: args.accountNumber,
      bank_code: args.bankCode,
      currency: "NGN",
    }),
  });
  return { recipientCode: data.recipient_code };
}

/**
 * Starts a transfer. This is an initiation, not a settlement — Paystack
 * accounts with transfer OTP enabled will come back with status "otp" and
 * need a dashboard step to finalise, and even a "success" here is provisional
 * until the transfer.success webhook confirms it. Nothing in this app marks a
 * payout settled, or reduces what a seller is owed, until that webhook lands
 * (see webhook.routes.ts) — same rule as verifying a card payment before
 * trusting it.
 */
export async function initiateTransfer(args: {
  amountKobo: Kobo;
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<{ transferCode: string; status: string }> {
  const { data } = await call<{ transfer_code: string; status: string }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: args.amountKobo.toString(),
      recipient: args.recipientCode,
      reference: args.reference,
      reason: args.reason,
      currency: "NGN",
    }),
  });
  return { transferCode: data.transfer_code, status: data.status };
}
