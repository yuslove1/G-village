import { Router } from "express";
import { z } from "zod";
import { ListingStatus, Tier, type Grade } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { conflict, notFound } from "../../lib/errors.js";
import { money, maybeMoney } from "../../lib/serialize.js";

export const wishlistRouter = Router();

wishlistRouter.use(requireAuth);

wishlistRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.wishlist.findMany({
      where: { userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      include: { listing: { include: { product: true } } },
    });
    res.json({ wishlist: rows.map((w) => ({ id: w.id, createdAt: w.createdAt, listing: toListingDto(w.listing) })) });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.post("/", async (req, res, next) => {
  try {
    const { listingId } = z.object({ listingId: z.string().cuid() }).parse(req.body);

    const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { product: true } });
    if (!listing) throw notFound("That listing");

    const existing = await prisma.wishlist.findUnique({
      where: { userId_listingId: { userId: req.auth!.userId, listingId } },
    });
    if (existing) throw conflict("Already saved");

    await prisma.wishlist.create({ data: { userId: req.auth!.userId, listingId } });
    res.status(201).json({ listing: toListingDto(listing) });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.delete("/:listingId", async (req, res, next) => {
  try {
    await prisma.wishlist.deleteMany({
      where: { userId: req.auth!.userId, listingId: req.params.listingId ?? "" },
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

interface ListingRow {
  id: string;
  reference: string;
  tier: Tier;
  status: ListingStatus;
  priceKobo: bigint;
  grade: Grade | null;
  batteryHealth: number | null;
  photos: string[];
  stockCount: number;
  publishedAt: Date | null;
  product: { brand: string; model: string; variant: string | null; category: string; baseNewKobo: bigint };
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
    inStock: l.stockCount > 0 && l.status === ListingStatus.LIVE,
    publishedAt: l.publishedAt,
  };
}
