import { Router } from "express";
import { z } from "zod";
import { Grade, PaymentChannel } from "@prisma/client";
import { requireAuth } from "../../middleware/auth.js";
import { idempotent } from "../../middleware/idempotency.js";
import { paymentLimiter } from "../../middleware/rateLimit.js";
import * as orders from "./order.service.js";
import { startPayment, settlePayment } from "../payments/payment.service.js";
import { money, maybeMoney } from "../../lib/serialize.js";
import { prisma } from "../../lib/prisma.js";
import { unauthorized } from "../../lib/errors.js";
import { renderReceiptPdf } from "../../lib/receipt-pdf.js";

export const orderRouter = Router();

orderRouter.use(requireAuth);

const createSchema = z.object({
  addressId: z.string().cuid().optional(),
  items: z.array(z.object({
    listingId: z.string().cuid(),
    quantity: z.number().int().min(1).max(5).default(1),
  })).min(1).max(20),
  tradeIn: z.object({
    productId: z.string().cuid(),
    grade: z.nativeEnum(Grade),
    batteryHealth: z.number().int().min(0).max(100).optional(),
    ageMonths: z.number().int().min(0).max(240),
  }).optional(),
  deliveryKobo: z.coerce.bigint().min(0n).max(5_000_000n).default(0n),
});

orderRouter.post("/", idempotent("orders.create"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const order = await orders.createOrder({ userId: req.auth!.userId, ...body });
    res.status(201).json({
      order: {
        reference: order.reference,
        status: order.status,
        subtotal: money(order.subtotalKobo),
        tradeIn: money(order.tradeInKobo),
        delivery: money(order.deliveryKobo),
        total: money(order.totalKobo),
        reservedUntil: order.reservedUntil,
      },
    });
  } catch (err) { next(err); }
});

orderRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.order.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { items: true },
    });
    res.json({
      orders: rows.map((o) => ({
        reference: o.reference,
        status: o.status,
        total: money(o.totalKobo),
        itemCount: o.items.length,
        title: o.items[0]?.titleSnapshot ?? "Order",
        createdAt: o.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

orderRouter.get("/:reference", async (req, res, next) => {
  try {
    const o = await orders.getOrderForUser(req.params.reference ?? "", req.auth!.userId);
    res.json({
      order: {
        reference: o.reference,
        status: o.status,
        subtotal: money(o.subtotalKobo),
        tradeIn: money(o.tradeInKobo),
        delivery: money(o.deliveryKobo),
        total: money(o.totalKobo),
        reservedUntil: o.reservedUntil,
        deliveredAt: o.deliveredAt,
        createdAt: o.createdAt,
        address: o.address && {
          label: o.address.label, line1: o.address.line1,
          city: o.address.city, state: o.address.state,
        },
        items: o.items.map((i) => ({
          title: i.titleSnapshot,
          quantity: i.quantity,
          unitPrice: money(i.unitPriceKobo),
          lineTotal: money(i.unitPriceKobo * BigInt(i.quantity)),
          tier: i.listing.tier,
        })),
        timeline: o.events.map((e) => ({ status: e.status, note: e.note, at: e.createdAt })),
        payment: o.payments[0] && {
          status: o.payments[0].status,
          channel: o.payments[0].channel,
          paidAt: o.payments[0].paidAt,
        },
      },
    });
  } catch (err) { next(err); }
});

orderRouter.post("/:reference/pay", paymentLimiter, idempotent("orders.pay"), async (req, res, next) => {
  try {
    const { channel, savedCardId } = z.object({
      channel: z.nativeEnum(PaymentChannel),
      savedCardId: z.string().cuid().optional(),
    }).parse(req.body);
    const order = await orders.getOrderForUser(req.params.reference ?? "", req.auth!.userId);

    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw unauthorized();

    const result = await startPayment({
      orderId: order.id,
      userId: req.auth!.userId,
      // Paystack requires an email. Fall back to a routable placeholder for
      // phone-only accounts so a receipt still has somewhere to land.
      email: user.email ?? `${user.phone.replace(/\D/g, "")}@customers.gadgetvillage.ng`,
      channel,
      savedCardId,
    });

    res.json({ payment: result });
  } catch (err) { next(err); }
});

// The browser lands here after Paystack redirects. Belt and braces alongside
// the webhook, because a customer staring at a spinner will not wait for a
// retry schedule.
orderRouter.post("/:reference/confirm", async (req, res, next) => {
  try {
    const { paymentReference } = z.object({ paymentReference: z.string().min(6).max(120) }).parse(req.body);
    await orders.getOrderForUser(req.params.reference ?? "", req.auth!.userId);
    const result = await settlePayment(paymentReference);
    res.json(result);
  } catch (err) { next(err); }
});

function buildReceipt(o: Awaited<ReturnType<typeof orders.getOrderForUser>>) {
  return {
    reference: o.reference,
    issuedAt: o.payments[0]?.paidAt ?? o.createdAt,
    paid: o.payments[0]?.status === "SUCCESS",
    lines: o.items.map((i) => ({
      description: i.titleSnapshot,
      quantity: i.quantity,
      amount: money(i.unitPriceKobo * BigInt(i.quantity)),
    })),
    tradeInCredit: maybeMoney(o.tradeInKobo > 0n ? -o.tradeInKobo : null),
    delivery: money(o.deliveryKobo),
    total: money(o.totalKobo),
    deliverTo: o.address ? `${o.address.line1}, ${o.address.city}, ${o.address.state}` : null,
  };
}

orderRouter.get("/:reference/receipt", async (req, res, next) => {
  try {
    const o = await orders.getOrderForUser(req.params.reference ?? "", req.auth!.userId);
    res.json({ receipt: buildReceipt(o) });
  } catch (err) { next(err); }
});

orderRouter.get("/:reference/receipt.pdf", async (req, res, next) => {
  try {
    const o = await orders.getOrderForUser(req.params.reference ?? "", req.auth!.userId);
    const receipt = buildReceipt(o);
    const pdf = await renderReceiptPdf({ ...receipt, issuedAt: new Date(receipt.issuedAt) });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="receipt-${o.reference}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});
