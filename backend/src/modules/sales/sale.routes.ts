import { Router } from "express";
import { z } from "zod";
import { Grade, SaleMode, SaleStatus, Tier, ListingStatus } from "@prisma/client";
import { addDays } from "date-fns";
import { customAlphabet } from "nanoid";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { quoteLimiter } from "../../middleware/rateLimit.js";
import { appraise, tradeInCredit } from "../../lib/appraisal.js";
import { money, maybeMoney } from "../../lib/serialize.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";

export const saleRouter = Router();
const makeRef = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

const deviceSchema = z.object({
  productId: z.string().cuid(),
  ageMonths: z.number().int().min(0).max(240),
  grade: z.nativeEnum(Grade),
  batteryHealth: z.number().int().min(0).max(100).optional(),
  hasOriginalBox: z.boolean().default(false),
  hasCharger: z.boolean().default(false),
  isCracked: z.boolean().default(false),
});

// Open to anyone. Somebody weighing up whether to sell should not have to
// create an account to find out what their phone is worth.
saleRouter.post("/quote", quoteLimiter, async (req, res, next) => {
  try {
    const body = deviceSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw notFound("That device");

    const result = appraise({
      baseNewKobo: product.baseNewKobo,
      category: product.category,
      ...body,
      batteryHealth: body.batteryHealth ?? null,
    });

    res.json({
      quote: {
        offer: money(result.offerKobo),
        suggestedList: money(result.suggestedListKobo),
        confidence: result.confidence,
        // Shown to the seller. An offer somebody can check line by line gets
        // argued with far less than one that arrives as a single number.
        breakdown: result.lines.map((l) => ({
          label: l.label,
          amount: money(l.deltaKobo),
        })),
        validUntil: addDays(new Date(), 7),
      },
    });
  } catch (err) { next(err); }
});

// The checkout trade-in step needs the actual applied credit, not the sell
// flow's offer — tradeInCredit() shaves 7% off appraise()'s offer to cover
// the device going uninspected at the point this credit is granted (see
// lib/appraisal.ts). Showing the seller-facing offer here instead would
// quote a bigger number than what createOrder() actually applies.
saleRouter.post("/trade-in-quote", quoteLimiter, async (req, res, next) => {
  try {
    const body = deviceSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw notFound("That device");

    const creditKobo = tradeInCredit({
      baseNewKobo: product.baseNewKobo,
      category: product.category,
      ...body,
      batteryHealth: body.batteryHealth ?? null,
    });

    res.json({ credit: money(creditKobo) });
  } catch (err) { next(err); }
});

saleRouter.use(requireAuth);

saleRouter.post("/", async (req, res, next) => {
  try {
    const body = deviceSchema.extend({
      mode: z.nativeEnum(SaleMode),
      photos: z.array(z.string().url()).min(2).max(8),
      pickupType: z.enum(["pickup", "dropoff"]).optional(),
      pickupAt: z.coerce.date().optional(),
      pickupAddress: z.string().max(200).optional(),
    }).parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw notFound("That device");

    const result = appraise({
      baseNewKobo: product.baseNewKobo,
      category: product.category,
      ...body,
      batteryHealth: body.batteryHealth ?? null,
    });

    const sale = await prisma.saleRequest.create({
      data: {
        reference: makeRef(),
        sellerId: req.auth!.userId,
        productId: body.productId,
        mode: body.mode,
        status: body.pickupAt ? SaleStatus.BOOKED : SaleStatus.QUOTED,
        claimedGrade: body.grade,
        claimedBattery: body.batteryHealth ?? null,
        photos: body.photos,
        quotedKobo: result.offerKobo,
        quoteExpiresAt: addDays(new Date(), 7),
        pickupType: body.pickupType ?? null,
        pickupAt: body.pickupAt ?? null,
        pickupAddress: body.pickupAddress ?? null,
      },
    });

    res.status(201).json({
      sale: {
        reference: sale.reference,
        status: sale.status,
        mode: sale.mode,
        offer: money(sale.quotedKobo),
        quoteExpiresAt: sale.quoteExpiresAt,
        pickupAt: sale.pickupAt,
      },
    });
  } catch (err) { next(err); }
});

saleRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.saleRequest.findMany({
      where: { sellerId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { listing: { include: { product: true } }, inspection: true },
    });

    // SaleRequest.productId is a bare string, not a Prisma relation (the
    // schema never declared one), so the device name has to be joined by
    // hand — same pattern the admin inspections queue already uses.
    const products = await prisma.product.findMany({
      where: { id: { in: rows.map((s) => s.productId) } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    res.json({
      sales: rows.map((s) => {
        const p = byId.get(s.productId);
        return {
          reference: s.reference,
          title: p ? [p.brand, p.model, p.variant].filter(Boolean).join(" ") : "Device",
          status: s.status,
          mode: s.mode,
          offer: money(s.quotedKobo),
          finalOffer: maybeMoney(s.finalKobo),
          pickupAt: s.pickupAt,
          inspected: Boolean(s.inspection?.approvedAt),
          createdAt: s.createdAt,
        };
      }),
    });
  } catch (err) { next(err); }
});

saleRouter.post("/:reference/cancel", async (req, res, next) => {
  try {
    const sale = await prisma.saleRequest.findUnique({
      where: { reference: req.params.reference ?? "" },
    });
    if (!sale || sale.sellerId !== req.auth!.userId) throw notFound("That sale");

    const cancellable: SaleStatus[] = [SaleStatus.QUOTED, SaleStatus.BOOKED];
    if (!cancellable.includes(sale.status)) {
      throw conflict("This sale has gone too far to cancel here. Call us.");
    }

    await prisma.saleRequest.update({
      where: { id: sale.id },
      data: { status: SaleStatus.CANCELLED },
    });
    res.json({ cancelled: true });
  } catch (err) { next(err); }
});
