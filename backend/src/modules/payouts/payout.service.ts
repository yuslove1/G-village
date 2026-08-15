import { PayoutStatus, SaleMode, SaleStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { postJournal, SYSTEM_ACCOUNTS } from "../../lib/ledger.js";

/**
 * Settles a payout. Called only from the transfer.success / transfer.failed /
 * transfer.reversed webhook — never from the request that initiates the
 * transfer, because Paystack's own response to that request is provisional.
 *
 * Safe to call twice with the same reference: a Payout already in a terminal
 * state is a no-op, same idempotency shape as settlePayment() for card
 * payments.
 */
export async function settleTransfer(
  reference: string,
  outcome: "success" | "failed",
  failureReason?: string,
) {
  const payout = await prisma.payout.findUnique({ where: { reference } });
  if (!payout) {
    logger.warn({ reference }, "transfer webhook for unknown payout reference");
    return;
  }
  if (payout.status !== PayoutStatus.PENDING) return;

  if (outcome === "failed") {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.FAILED, failureReason: failureReason ?? "Transfer failed", completedAt: new Date() },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.payout.findUnique({ where: { id: payout.id } });
    if (!fresh || fresh.status !== PayoutStatus.PENDING) return;

    await tx.payout.update({
      where: { id: fresh.id },
      data: { status: PayoutStatus.SUCCESS, completedAt: new Date() },
    });

    const sellerAccount = `liability:user:${fresh.userId}`;
    await postJournal(tx, {
      reason: "seller_payout",
      description: `Payout ${fresh.reference} to seller`,
      reference: `JE-PO-${fresh.reference}`,
      lines: [
        { accountCode: sellerAccount, amountKobo: fresh.amountKobo },
        { accountCode: SYSTEM_ACCOUNTS.cashPaystack.code, amountKobo: -fresh.amountKobo },
      ],
    });

    // The withdrawal pays out the seller's whole outstanding balance in one
    // transfer, so every direct sale still waiting on payment is settled by
    // it — there is no partial-withdrawal path that would make this ambiguous.
    await tx.saleRequest.updateMany({
      where: { sellerId: fresh.userId, mode: SaleMode.DIRECT, status: SaleStatus.APPROVED },
      data: { status: SaleStatus.PAID },
    });
  });
}
