import { Router } from "express";
import { z } from "zod";
import { PayoutStatus, SaleMode, SaleStatus } from "@prisma/client";
import { nanoid } from "nanoid";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { money } from "../../lib/serialize.js";
import { accountBalance, ensureUserAccount } from "../../lib/ledger.js";
import { createTransferRecipient, initiateTransfer, resolveAccount } from "../../lib/paystack.js";
import { logger } from "../../lib/logger.js";

export const payoutRouter = Router();

payoutRouter.use(requireAuth);

// Banks Paystack settles to most often. Just a code+name picker for the
// dropdown — the account itself is verified against Paystack's bank-resolve
// API below before it is ever saved, so a wrong pick here just fails that
// check rather than silently accepting an unverified account.
const BANKS = [
  { code: "058", name: "GTBank" },
  { code: "057", name: "Zenith Bank" },
  { code: "011", name: "First Bank" },
  { code: "044", name: "Access Bank" },
  { code: "033", name: "UBA" },
  { code: "232", name: "Sterling Bank" },
  { code: "50211", name: "Kuda" },
  { code: "999992", name: "Opay" },
  { code: "50515", name: "Moniepoint" },
] as const;

payoutRouter.get("/banks", (_req, res) => res.json({ banks: BANKS }));

payoutRouter.get("/", async (req, res, next) => {
  try {
    const userId = req.auth!.userId;

    // A user with no approved direct sale yet has never had this account
    // created — that is "nothing owed," not an error.
    const code = `liability:user:${userId}`;
    const exists = await prisma.ledgerAccount.findUnique({ where: { code } });
    const owedKobo = exists ? -(await accountBalance(prisma, code)) : 0n;

    const [accounts, pendingPayout, paidSales] = await Promise.all([
      prisma.payoutAccount.findMany({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      }),
      prisma.payout.findFirst({ where: { userId, status: PayoutStatus.PENDING } }),
      prisma.saleRequest.findMany({
        where: { sellerId: userId, mode: SaleMode.DIRECT, status: SaleStatus.PAID },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);

    const products = await prisma.product.findMany({
      where: { id: { in: paidSales.map((s) => s.productId) } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    res.json({
      balance: money(owedKobo > 0n ? owedKobo : 0n),
      accounts: accounts.map(toAccountDto),
      pendingPayout: pendingPayout
        ? { reference: pendingPayout.reference, amount: money(pendingPayout.amountKobo) }
        : null,
      recentPayouts: paidSales.map((s) => {
        const p = productById.get(s.productId);
        return {
          reference: s.reference,
          device: p ? [p.brand, p.model, p.variant].filter(Boolean).join(" ") : "Device",
          amount: money(s.finalKobo ?? s.quotedKobo),
          paidAt: s.updatedAt,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().regex(/^\d{10}$/, "Enter a 10-digit account number"),
  accountName: z.string().trim().min(2).max(80),
});

payoutRouter.post("/accounts", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const bank = BANKS.find((b) => b.code === body.bankCode);
    if (!bank) return next(notFound("That bank"));

    // Verified against Paystack directly, not trusted from what the seller
    // typed — the resolved name is what gets saved, and doubles as proof the
    // account number is real before we ever try to send money to it.
    let resolvedName: string;
    let recipientCode: string;
    try {
      const resolved = await resolveAccount(body.accountNumber, body.bankCode);
      resolvedName = resolved.account_name;
      const recipient = await createTransferRecipient({
        name: resolvedName,
        accountNumber: body.accountNumber,
        bankCode: body.bankCode,
      });
      recipientCode = recipient.recipientCode;
    } catch (err) {
      logger.warn({ err, bankCode: body.bankCode }, "bank account verification failed");
      throw badRequest("Could not verify that account number with the selected bank");
    }

    await ensureUserAccount(prisma, req.auth!.userId);

    const account = await prisma.$transaction(async (tx) => {
      const existingCount = await tx.payoutAccount.count({ where: { userId: req.auth!.userId } });
      if (existingCount > 0) {
        await tx.payoutAccount.updateMany({
          where: { userId: req.auth!.userId },
          data: { isDefault: false },
        });
      }
      return tx.payoutAccount.create({
        data: {
          userId: req.auth!.userId,
          bankCode: body.bankCode,
          bankName: bank.name,
          accountLast4: body.accountNumber.slice(-4),
          accountRef: recipientCode,
          accountName: resolvedName,
          isDefault: true,
        },
      });
    });

    res.status(201).json({ account: toAccountDto(account) });
  } catch (err) {
    next(err);
  }
});

payoutRouter.delete("/accounts/:id", async (req, res, next) => {
  try {
    const existing = await prisma.payoutAccount.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId) throw notFound("That payout account");

    await prisma.payoutAccount.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * Withdraws the seller's entire outstanding balance to their default account.
 * Only initiates the transfer — the balance does not move and no sale flips
 * to PAID until the transfer.success webhook confirms it actually landed
 * (see payout.service.ts). Until then this Payout sits PENDING, which the
 * GET / response surfaces so the UI can't fire a second withdrawal on top.
 */
payoutRouter.post("/withdraw", async (req, res, next) => {
  try {
    const userId = req.auth!.userId;

    const alreadyPending = await prisma.payout.findFirst({
      where: { userId, status: PayoutStatus.PENDING },
    });
    if (alreadyPending) throw badRequest("A payout is already in progress");

    const account = await prisma.payoutAccount.findFirst({ where: { userId, isDefault: true } });
    if (!account) throw badRequest("Add a payout account first");
    if (!account.accountRef) {
      throw badRequest("That payout account needs to be re-added before it can be paid out");
    }

    const code = `liability:user:${userId}`;
    const exists = await prisma.ledgerAccount.findUnique({ where: { code } });
    const balanceKobo = exists ? -(await accountBalance(prisma, code)) : 0n;
    if (balanceKobo <= 0n) throw badRequest("Nothing to withdraw");

    const reference = `PO-${nanoid(12)}`;
    const payout = await prisma.payout.create({
      data: {
        reference,
        userId,
        payoutAccountId: account.id,
        amountKobo: balanceKobo,
        status: PayoutStatus.PENDING,
      },
    });

    try {
      const transfer = await initiateTransfer({
        amountKobo: balanceKobo,
        recipientCode: account.accountRef,
        reference,
        reason: "Gadgetvillage seller payout",
      });
      await prisma.payout.update({ where: { id: payout.id }, data: { transferCode: transfer.transferCode } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transfer could not be started";
      await prisma.payout.update({
        where: { id: payout.id },
        data: { status: PayoutStatus.FAILED, failureReason: message, completedAt: new Date() },
      });
      throw badRequest(message);
    }

    res.status(202).json({ pending: true, reference, amount: money(balanceKobo) });
  } catch (err) {
    next(err);
  }
});

interface PayoutAccountRow {
  id: string;
  bankName: string;
  accountLast4: string;
  accountName: string;
  isDefault: boolean;
}

function toAccountDto(a: PayoutAccountRow) {
  return {
    id: a.id,
    bankName: a.bankName,
    accountLast4: a.accountLast4,
    accountName: a.accountName,
    isDefault: a.isDefault,
  };
}
