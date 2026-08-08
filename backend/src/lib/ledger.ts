import { AccountType, type Prisma, type PrismaClient } from "@prisma/client";
import { sum, type Kobo } from "./money.js";
import { nanoid } from "nanoid";

/**
 * Double-entry posting engine.
 *
 * The single rule: a journal whose entries do not sum to zero is rejected
 * before it touches the database. That one constraint is what makes the books
 * checkable. If cash and payables ever disagree, the bug is in code we can
 * find, not in a balance column that drifted six weeks ago.
 *
 * Positive amounts are debits, negative are credits.
 */

export interface PostingLine {
  accountCode: string;
  amountKobo: Kobo;
}

export interface PostJournalArgs {
  reason: string;
  description: string;
  lines: PostingLine[];
  reference?: string;
}

/** Accounts the platform always has. Created on first boot by the seeder. */
export const SYSTEM_ACCOUNTS = {
  cashPaystack: { code: "cash:paystack", name: "Cash held at Paystack", type: AccountType.ASSET },
  cashBank: { code: "cash:bank", name: "Operating bank account", type: AccountType.ASSET },
  inventory: { code: "asset:inventory", name: "Inventory on hand", type: AccountType.ASSET },
  sellerPayable: { code: "liability:seller_payable", name: "Owed to sellers", type: AccountType.LIABILITY },
  vendorPayable: { code: "liability:vendor_payable", name: "Owed to vendors", type: AccountType.LIABILITY },
  buyerCredit: { code: "liability:buyer_credit", name: "Trade-in credit owed to buyers", type: AccountType.LIABILITY },
  revenueMargin: { code: "revenue:margin", name: "Margin on sales", type: AccountType.REVENUE },
  revenueCommission: { code: "revenue:commission", name: "Commission on listings", type: AccountType.REVENUE },
  expenseDelivery: { code: "expense:delivery", name: "Delivery costs", type: AccountType.EXPENSE },
  expenseFees: { code: "expense:payment_fees", name: "Payment processor fees", type: AccountType.EXPENSE },
} as const;

export class UnbalancedJournalError extends Error {
  constructor(public readonly delta: Kobo) {
    super(`Journal does not balance. Off by ${delta} kobo.`);
    this.name = "UnbalancedJournalError";
  }
}

type Tx = Prisma.TransactionClient | PrismaClient;

export async function postJournal(tx: Tx, args: PostJournalArgs) {
  const { lines, reason, description } = args;

  if (lines.length < 2) {
    throw new Error("A journal needs at least two lines");
  }

  const delta = sum(lines.map((l) => l.amountKobo));
  if (delta !== 0n) throw new UnbalancedJournalError(delta);

  if (lines.some((l) => l.amountKobo === 0n)) {
    throw new Error("Zero-amount lines are not allowed");
  }

  const codes = [...new Set(lines.map((l) => l.accountCode))];
  const accounts = await tx.ledgerAccount.findMany({ where: { code: { in: codes } } });

  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const missing = codes.filter((c) => !byCode.has(c));
  if (missing.length) {
    throw new Error(`Unknown ledger accounts: ${missing.join(", ")}`);
  }

  return tx.journalEntry.create({
    data: {
      reference: args.reference ?? `JE-${nanoid(12)}`,
      reason,
      description,
      entries: {
        create: lines.map((l) => ({
          accountId: byCode.get(l.accountCode)!.id,
          amountKobo: l.amountKobo,
        })),
      },
    },
    include: { entries: true },
  });
}

/** Balance is always derived. There is no cached balance column to drift. */
export async function accountBalance(tx: Tx, accountCode: string): Promise<Kobo> {
  const account = await tx.ledgerAccount.findUnique({ where: { code: accountCode } });
  if (!account) throw new Error(`No such account: ${accountCode}`);

  const result = await tx.ledgerEntry.aggregate({
    where: { accountId: account.id },
    _sum: { amountKobo: true },
  });
  return result._sum.amountKobo ?? 0n;
}

/**
 * Per-user payable account, created lazily. Every seller gets their own
 * liability account so "what do we owe Ade" is one query, not a scan.
 */
export async function ensureUserAccount(tx: Tx, userId: string): Promise<string> {
  const code = `liability:user:${userId}`;
  const existing = await tx.ledgerAccount.findUnique({ where: { code } });
  if (existing) return code;

  await tx.ledgerAccount.create({
    data: { code, name: `Payable to user ${userId}`, type: AccountType.LIABILITY, userId },
  });
  return code;
}

/**
 * Health check for the whole book. Every journal must net to zero, so the sum
 * of every entry ever written must also be zero. Run this on a schedule. If it
 * ever returns non-zero, stop taking payments and go look at what happened.
 */
export async function trialBalance(tx: Tx): Promise<{ balanced: boolean; delta: Kobo }> {
  const result = await tx.ledgerEntry.aggregate({ _sum: { amountKobo: true } });
  const delta = result._sum.amountKobo ?? 0n;
  return { balanced: delta === 0n, delta };
}
