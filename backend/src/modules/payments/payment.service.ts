import { ListingStatus, OrderStatus, PaymentStatus, PaymentChannel } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { postJournal, SYSTEM_ACCOUNTS } from "../../lib/ledger.js";
import { initTransaction, verifyTransaction } from "../../lib/paystack.js";
import { env } from "../../config/env.js";
import { nanoid } from "nanoid";

/**
 * Everything that turns an intent to pay into money in the account.
 *
 * The rule running through this file: the database is only allowed to believe
 * Paystack, and only after asking Paystack directly. A webhook body is a
 * notification that something might have happened, not evidence that it did.
 */

export async function startPayment(opts: {
  orderId: string;
  userId: string;
  email: string;
  channel: PaymentChannel;
}) {
  const order = await prisma.order.findUnique({
    where: { id: opts.orderId },
    include: { payments: true },
  });

  if (!order) throw notFound("That order");
  if (order.userId !== opts.userId) throw notFound("That order");
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    throw conflict("That order has already been paid for");
  }
  if (order.reservedUntil && order.reservedUntil < new Date()) {
    throw conflict("The hold on this order expired. Start a new one.");
  }

  const reference = `GV-${order.reference}-${nanoid(8)}`;

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      providerRef: reference,
      channel: opts.channel,
      status: PaymentStatus.INITIATED,
      amountKobo: order.totalKobo,
    },
  });

  if (opts.channel === PaymentChannel.CASH_ON_DELIVERY) {
    return { paymentId: payment.id, reference, authorizationUrl: null };
  }

  const init = await initTransaction({
    email: opts.email,
    amountKobo: order.totalKobo,
    reference,
    callbackUrl: `${env.APP_URL}/orders/${order.reference}/confirm`,
    metadata: { orderId: order.id, orderRef: order.reference, userId: opts.userId },
    channels: opts.channel === PaymentChannel.BANK_TRANSFER ? ["bank_transfer", "ussd"] : ["card"],
  });

  return {
    paymentId: payment.id,
    reference,
    authorizationUrl: init.authorization_url,
  };
}

/**
 * Settles a payment. Safe to call repeatedly with the same reference: the
 * second call finds the order already paid and returns without doing anything.
 * Both the webhook and the browser redirect land here.
 */
export async function settlePayment(reference: string) {
  const payment = await prisma.payment.findUnique({
    where: { providerRef: reference },
    include: { order: { include: { items: { include: { listing: true } } } } },
  });

  if (!payment) throw notFound("That payment");

  if (payment.status === PaymentStatus.SUCCESS) {
    return { alreadySettled: true, orderId: payment.orderId };
  }

  // Ask Paystack. Do not trust whatever prompted this call.
  const verified = await verifyTransaction(reference);

  if (verified.status !== "success") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: verified.status === "failed" ? PaymentStatus.FAILED : PaymentStatus.ABANDONED,
        failureReason: `Paystack reported ${verified.status}`,
        raw: verified.raw as never,
      },
    });
    return { alreadySettled: false, orderId: payment.orderId, paid: false };
  }

  // Underpayment check. A forged or tampered flow shows up right here.
  if (verified.amountKobo < payment.amountKobo) {
    logger.error(
      { reference, expected: payment.amountKobo.toString(), got: verified.amountKobo.toString() },
      "payment underpaid, holding order",
    );
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        verifiedKobo: verified.amountKobo,
        failureReason: "Amount paid was less than the order total",
        raw: verified.raw as never,
      },
    });
    throw badRequest("The amount received does not match this order");
  }

  // One transaction: mark paid, move stock, write the books. Any failure rolls
  // the whole thing back rather than leaving an order paid with no inventory.
  const orderId = await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({
      where: { id: payment.orderId },
      include: { items: true },
    });
    if (!fresh) throw notFound("That order");
    if (fresh.status !== OrderStatus.PENDING_PAYMENT) return fresh.id;

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        verifiedKobo: verified.amountKobo,
        paidAt: verified.paidAt ?? new Date(),
        raw: verified.raw as never,
      },
    });

    await tx.order.update({
      where: { id: fresh.id },
      data: { status: OrderStatus.PAID, reservedUntil: null },
    });

    await tx.orderEvent.create({
      data: { orderId: fresh.id, status: OrderStatus.PAID, note: `Paystack ${reference}` },
    });

    for (const item of fresh.items) {
      await tx.listing.update({
        where: { id: item.listingId },
        data: {
          status: ListingStatus.SOLD,
          stockCount: { decrement: item.quantity },
        },
      });
    }

    // Books. Cash in, what we owe suppliers out, the difference is margin.
    const cost = fresh.items.reduce<bigint>(
      (acc, i) => acc + (i.unitCostKobo ?? 0n) * BigInt(i.quantity),
      0n,
    );
    const fees = verified.feesKobo;
    const margin = verified.amountKobo - cost - fees;

    const lines = [
      { accountCode: SYSTEM_ACCOUNTS.cashPaystack.code, amountKobo: verified.amountKobo - fees },
      { accountCode: SYSTEM_ACCOUNTS.expenseFees.code, amountKobo: fees },
      { accountCode: SYSTEM_ACCOUNTS.vendorPayable.code, amountKobo: -cost },
      { accountCode: SYSTEM_ACCOUNTS.revenueMargin.code, amountKobo: -margin },
    ].filter((l) => l.amountKobo !== 0n);

    await postJournal(tx, {
      reason: "order_paid",
      description: `Order ${fresh.reference} paid`,
      reference: `JE-ORD-${fresh.reference}`,
      lines,
    });

    return fresh.id;
  });

  return { alreadySettled: false, orderId, paid: true };
}

/**
 * Releases stock from orders whose payment window closed. Runs on a timer.
 * Without this, a customer who abandons checkout keeps a phone off the market
 * until somebody notices.
 */
export async function expireStaleReservations() {
  const stale = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING_PAYMENT,
      reservedUntil: { lt: new Date() },
    },
    select: { id: true, reference: true, items: { select: { listingId: true, quantity: true } } },
    take: 100,
  });

  for (const order of stale) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.CANCELLED, cancelledAt: new Date() },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          status: OrderStatus.CANCELLED,
          note: "Payment window closed, stock released",
        },
      });
      for (const item of order.items) {
        await tx.listing.updateMany({
          where: { id: item.listingId, status: ListingStatus.RESERVED },
          data: { status: ListingStatus.LIVE },
        });
      }
    });
    logger.info({ order: order.reference }, "reservation expired");
  }

  return stale.length;
}
