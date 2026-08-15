import { Router } from "express";
import { z } from "zod";
import { ListingStatus, Tier } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { maybeMoney } from "../../lib/serialize.js";

export const alertRouter = Router();

alertRouter.use(requireAuth);

const createSchema = z
  .object({
    productId: z.string().cuid().optional(),
    query: z.string().trim().min(2).max(120).optional(),
    tiers: z.array(z.nativeEnum(Tier)).default([]),
    maxKobo: z.coerce.bigint().min(0n).optional(),
    viaPush: z.boolean().default(true),
    viaEmail: z.boolean().default(true),
    viaSms: z.boolean().default(false),
  })
  // A useful alert needs something to match against — a pinned model or a
  // free-text search. Neither is a schema-level default, so this is the one
  // rule zod cannot express as a plain field constraint.
  .refine((v) => v.productId || v.query, {
    message: "Pin a device or enter a search term",
    path: ["query"],
  });

alertRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);

    if (body.productId) {
      const product = await prisma.product.findUnique({ where: { id: body.productId } });
      if (!product) throw notFound("That device");
    }

    const alert = await prisma.alert.create({
      data: { userId: req.auth!.userId, ...body },
      include: { product: true },
    });

    res.status(201).json({ alert: toAlertDto(alert) });
  } catch (err) {
    next(err);
  }
});

alertRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.alert.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });

    // No notification-firing job exists yet (lastFiredAt is never actually
    // set by anything) — this is a live "how many match right now" count
    // computed on read, which is honest without one, rather than a stale
    // cached number pretending a matcher runs in the background.
    const counts = await Promise.all(rows.map((a) => matchCount(a)));

    res.json({
      alerts: rows.map((a, i) => ({ ...toAlertDto(a), matchCount: counts[i] })),
    });
  } catch (err) {
    next(err);
  }
});

async function matchCount(alert: AlertRow): Promise<number> {
  return prisma.listing.count({
    where: {
      status: ListingStatus.LIVE,
      ...(alert.tiers.length > 0 ? { tier: { in: alert.tiers } } : {}),
      ...(alert.maxKobo != null ? { priceKobo: { lte: alert.maxKobo } } : {}),
      product: alert.product
        ? { id: alert.product.id }
        : alert.query
          ? {
              OR: [
                { model: { contains: alert.query, mode: "insensitive" as const } },
                { brand: { contains: alert.query, mode: "insensitive" as const } },
              ],
            }
          : undefined,
    },
  });
}

const updateSchema = z.object({
  isActive: z.boolean().optional(),
  viaPush: z.boolean().optional(),
  viaEmail: z.boolean().optional(),
  viaSms: z.boolean().optional(),
  maxKobo: z.coerce.bigint().min(0n).nullable().optional(),
});

alertRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update");

    const existing = await prisma.alert.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId) throw notFound("That alert");

    const alert = await prisma.alert.update({
      where: { id: existing.id },
      data: body,
      include: { product: true },
    });
    res.json({ alert: toAlertDto(alert) });
  } catch (err) {
    next(err);
  }
});

alertRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.alert.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId) throw notFound("That alert");

    await prisma.alert.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

interface AlertRow {
  id: string;
  query: string | null;
  tiers: Tier[];
  maxKobo: bigint | null;
  viaPush: boolean;
  viaEmail: boolean;
  viaSms: boolean;
  isActive: boolean;
  lastFiredAt: Date | null;
  createdAt: Date;
  product: { id: string; brand: string; model: string; variant: string | null; category: string } | null;
}

function toAlertDto(a: AlertRow) {
  return {
    id: a.id,
    product: a.product
      ? {
          id: a.product.id,
          title: [a.product.brand, a.product.model, a.product.variant].filter(Boolean).join(" "),
          category: a.product.category,
        }
      : null,
    query: a.query,
    tiers: a.tiers,
    maxPrice: maybeMoney(a.maxKobo),
    viaPush: a.viaPush,
    viaEmail: a.viaEmail,
    viaSms: a.viaSms,
    isActive: a.isActive,
    lastFiredAt: a.lastFiredAt,
    createdAt: a.createdAt,
  };
}
