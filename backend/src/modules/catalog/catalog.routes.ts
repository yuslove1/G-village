import { Router } from "express";
import { z } from "zod";
import { ListingStatus, Tier, type Grade } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { money, maybeMoney } from "../../lib/serialize.js";
import { notFound } from "../../lib/errors.js";
import { optionalAuth } from "../../middleware/auth.js";

export const catalogRouter = Router();

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  tier: z.nativeEnum(Tier).optional(),
  category: z.string().trim().max(40).optional(),
  brand: z.string().trim().max(40).optional(),
  minKobo: z.coerce.bigint().optional(),
  maxKobo: z.coerce.bigint().optional(),
  verified: z.coerce.boolean().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});

// Cursor pagination rather than offset. Offset gets slower the deeper you
// scroll and skips or repeats rows when stock changes mid-browse.
catalogRouter.get("/listings", optionalAuth, async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);

    const where = {
      status: ListingStatus.LIVE,
      ...(q.tier ? { tier: q.tier } : {}),
      ...(q.minKobo || q.maxKobo
        ? {
            priceKobo: {
              ...(q.minKobo ? { gte: q.minKobo } : {}),
              ...(q.maxKobo ? { lte: q.maxKobo } : {}),
            },
          }
        : {}),
      ...(q.verified ? { inspection: { approvedAt: { not: null } } } : {}),
      product: {
        ...(q.category ? { category: q.category } : {}),
        ...(q.brand ? { brand: { equals: q.brand, mode: "insensitive" as const } } : {}),
        ...(q.q
          ? {
              OR: [
                { model: { contains: q.q, mode: "insensitive" as const } },
                { brand: { contains: q.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    };

    const orderBy =
      q.sort === "price_asc"
        ? { priceKobo: "asc" as const }
        : q.sort === "price_desc"
          ? { priceKobo: "desc" as const }
          : { publishedAt: "desc" as const };

    const rows = await prisma.listing.findMany({
      where,
      orderBy,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { product: true },
    });

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    res.json({
      listings: page.map(toListingDto),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get("/listings/:reference", optionalAuth, async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { reference: req.params.reference ?? "" },
      include: { product: true, inspection: true },
    });
    if (!listing || listing.status === ListingStatus.DRAFT) throw notFound("That listing");

    res.json({
      listing: {
        ...toListingDto(listing),
        description: listing.descriptionMd,
        verified: Boolean(listing.inspection?.approvedAt),
        specs: listing.product.specs,
      },
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get("/products", async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      take: 200,
    });
    res.json({
      products: products.map((p) => ({
        id: p.id,
        slug: p.slug,
        brand: p.brand,
        model: p.model,
        variant: p.variant,
        category: p.category,
        releaseYear: p.releaseYear,
        baseNew: money(p.baseNewKobo),
      })),
    });
  } catch (err) {
    next(err);
  }
});

interface ListingRow {
  id: string;
  reference: string;
  tier: Tier;
  priceKobo: bigint;
  grade: Grade | null;
  batteryHealth: number | null;
  photos: string[];
  stockCount: number;
  publishedAt: Date | null;
  product: {
    brand: string;
    model: string;
    variant: string | null;
    category: string;
    baseNewKobo: bigint;
  };
}

function toListingDto(l: ListingRow) {
  const title = [l.product.brand, l.product.model, l.product.variant].filter(Boolean).join(" ");
  const saving = l.product.baseNewKobo > l.priceKobo ? l.product.baseNewKobo - l.priceKobo : null;
  return {
    id: l.id,
    reference: l.reference,
    title,
    category: l.product.category,
    tier: l.tier,
    price: money(l.priceKobo),
    saving: maybeMoney(saving),
    grade: l.grade,
    batteryHealth: l.batteryHealth,
    photos: l.photos,
    inStock: l.stockCount > 0,
    publishedAt: l.publishedAt,
  };
}
