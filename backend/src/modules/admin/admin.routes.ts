import { Router } from "express";
import { z } from "zod";
import {
  Grade,
  ListingStatus,
  OrderStatus,
  Role,
  SaleMode,
  SaleStatus,
  Tier,
} from "@prisma/client";
import { customAlphabet } from "nanoid";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { money, maybeMoney } from "../../lib/serialize.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { advanceStatus } from "../orders/order.service.js";
import { ensureUserAccount, postJournal, SYSTEM_ACCOUNTS, trialBalance } from "../../lib/ledger.js";

export const adminRouter = Router();
const makeListingRef = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

adminRouter.use(requireAuth);

/** Records who changed what. Called on every write in this router. */
async function audit(opts: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: opts.actorId,
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      before: (opts.before ?? null) as never,
      after: (opts.after ?? null) as never,
      ip: opts.ip ?? null,
    },
  });
}

// ------------------------------------------------------------------ overview

adminRouter.get("/overview", requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [paidToday, toFulfil, inspections, pendingPayouts, books] = await Promise.all([
      prisma.order.aggregate({
        where: { status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] }, createdAt: { gte: dayStart } },
        _sum: { totalKobo: true },
        _count: true,
      }),
      prisma.order.count({ where: { status: { in: [OrderStatus.PAID, OrderStatus.SOURCING] } } }),
      prisma.saleRequest.count({ where: { status: SaleStatus.BOOKED } }),
      prisma.saleRequest.count({ where: { status: SaleStatus.APPROVED } }),
      trialBalance(prisma),
    ]);

    res.json({
      today: {
        revenue: money(paidToday._sum.totalKobo ?? 0n),
        orders: paidToday._count,
      },
      queues: { toFulfil, inspections, pendingPayouts },
      ledger: { balanced: books.balanced, delta: books.delta.toString() },
    });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------- orders

adminRouter.get("/orders", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const q = z
      .object({
        status: z.nativeEnum(OrderStatus).optional(),
        cursor: z.string().cuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);

    const rows = await prisma.order.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: {
        user: { select: { fullName: true, phone: true } },
        address: { select: { city: true, state: true } },
        items: { include: { listing: { include: { vendor: true } } } },
      },
    });

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    res.json({
      orders: page.map((o) => {
        const cost = o.items.reduce<bigint>(
          (acc, i) => acc + (i.unitCostKobo ?? 0n) * BigInt(i.quantity),
          0n,
        );
        return {
          reference: o.reference,
          status: o.status,
          customer: o.user.fullName,
          phone: o.user.phone,
          location: o.address ? `${o.address.city}, ${o.address.state}` : null,
          total: money(o.totalKobo),
          cost: money(cost),
          margin: money(o.totalKobo - cost),
          vendor: o.items[0]?.listing.vendor?.businessName ?? null,
          title: o.items[0]?.titleSnapshot ?? "Order",
          createdAt: o.createdAt,
        };
      }),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/orders/:reference/status", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { status, note } = z
      .object({ status: z.nativeEnum(OrderStatus), note: z.string().max(280).optional() })
      .parse(req.body);

    const order = await prisma.order.findUnique({ where: { reference: req.params.reference ?? "" } });
    if (!order) throw notFound("That order");

    const updated = await advanceStatus({
      orderId: order.id,
      status,
      actorId: req.auth!.userId,
      note,
    });

    res.json({ order: { reference: updated.reference, status: updated.status } });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------- listings

adminRouter.post("/listings", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z
      .object({
        productId: z.string().cuid(),
        tier: z.nativeEnum(Tier),
        priceKobo: z.coerce.bigint().positive(),
        costKobo: z.coerce.bigint().nonnegative().optional(),
        vendorId: z.string().cuid().optional(),
        grade: z.nativeEnum(Grade).optional(),
        batteryHealth: z.number().int().min(0).max(100).optional(),
        stockCount: z.number().int().min(0).max(999).default(1),
        photos: z.array(z.string().url()).max(8).default([]),
        descriptionMd: z.string().max(4000).optional(),
        publish: z.boolean().default(false),
      })
      .parse(req.body);

    // A listing priced under cost is almost always a typo, and catching it
    // here is cheaper than catching it in the month-end numbers.
    if (body.costKobo != null && body.priceKobo < body.costKobo) {
      throw badRequest("Selling price is below cost. Check the figures.");
    }

    const listing = await prisma.listing.create({
      data: {
        reference: makeListingRef(),
        productId: body.productId,
        tier: body.tier,
        priceKobo: body.priceKobo,
        costKobo: body.costKobo ?? null,
        vendorId: body.vendorId ?? null,
        grade: body.grade ?? null,
        batteryHealth: body.batteryHealth ?? null,
        stockCount: body.stockCount,
        photos: body.photos,
        descriptionMd: body.descriptionMd ?? null,
        status: body.publish ? ListingStatus.LIVE : ListingStatus.DRAFT,
        publishedAt: body.publish ? new Date() : null,
      },
    });

    await audit({
      actorId: req.auth!.userId,
      action: "listing.create",
      entityType: "Listing",
      entityId: listing.id,
      after: { price: listing.priceKobo.toString(), status: listing.status },
      ip: req.ip,
    });

    res.status(201).json({ listing: { reference: listing.reference, status: listing.status } });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch("/listings/:reference", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z
      .object({
        priceKobo: z.coerce.bigint().positive().optional(),
        stockCount: z.number().int().min(0).max(999).optional(),
        status: z.nativeEnum(ListingStatus).optional(),
        descriptionMd: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const before = await prisma.listing.findUnique({ where: { reference: req.params.reference ?? "" } });
    if (!before) throw notFound("That listing");

    const listing = await prisma.listing.update({
      where: { id: before.id },
      data: {
        ...body,
        ...(body.status === ListingStatus.LIVE && !before.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    // Price changes are the ones worth being able to reconstruct later.
    await audit({
      actorId: req.auth!.userId,
      action: "listing.update",
      entityType: "Listing",
      entityId: listing.id,
      before: { price: before.priceKobo.toString(), status: before.status, stock: before.stockCount },
      after: { price: listing.priceKobo.toString(), status: listing.status, stock: listing.stockCount },
      ip: req.ip,
    });

    res.json({ listing: { reference: listing.reference, status: listing.status } });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------- vendors

adminRouter.get("/vendors", requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { isActive: true },
      include: { listings: { select: { id: true, priceKobo: true, costKobo: true, status: true } } },
      orderBy: { businessName: "asc" },
    });

    res.json({
      vendors: vendors.map((v) => {
        const sold = v.listings.filter((l) => l.status === ListingStatus.SOLD);
        const revenue = sold.reduce<bigint>((a, l) => a + l.priceKobo, 0n);
        const cost = sold.reduce<bigint>((a, l) => a + (l.costKobo ?? 0n), 0n);
        const marginBps = revenue > 0n ? Number(((revenue - cost) * 10000n) / revenue) : 0;
        return {
          id: v.id,
          businessName: v.businessName,
          contactName: v.contactName,
          phone: v.phone,
          location: v.location,
          supplies: v.supplies,
          ordersFilled: sold.length,
          marginPercent: (marginBps / 100).toFixed(1),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/vendors", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z
      .object({
        businessName: z.string().trim().min(2).max(120),
        contactName: z.string().trim().min(2).max(80),
        phone: z.string().trim().min(8).max(20),
        location: z.string().trim().min(2).max(160),
        supplies: z.array(z.string().max(30)).max(10).default([]),
        paymentTerms: z.string().max(160).optional(),
      })
      .parse(req.body);

    const vendor = await prisma.vendor.create({ data: body });
    await audit({
      actorId: req.auth!.userId,
      action: "vendor.create",
      entityType: "Vendor",
      entityId: vendor.id,
      after: { businessName: vendor.businessName },
      ip: req.ip,
    });

    res.status(201).json({ vendor: { id: vendor.id, businessName: vendor.businessName } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- inspections

adminRouter.get("/inspections", requireRole(Role.ADMIN, Role.AGENT), async (req, res, next) => {
  try {
    const sales = await prisma.saleRequest.findMany({
      where: { status: { in: [SaleStatus.BOOKED, SaleStatus.INSPECTED] } },
      orderBy: { pickupAt: "asc" },
      take: 50,
      include: {
        listing: { include: { product: true } },
        inspection: true,
      },
    });

    const productIds = sales.map((s) => s.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    res.json({
      inspections: sales.map((s) => {
        const p = byId.get(s.productId);
        return {
          reference: s.reference,
          device: p ? [p.brand, p.model, p.variant].filter(Boolean).join(" ") : "Unknown device",
          claimedGrade: s.claimedGrade,
          claimedBattery: s.claimedBattery,
          offer: money(s.quotedKobo),
          mode: s.mode,
          pickupAt: s.pickupAt,
          pickupAddress: s.pickupAddress,
          photos: s.photos,
          status: s.status,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Completing an inspection. This is where a device becomes stock and, for a
 * direct sale, where we take on a debt to the seller. Both halves happen in
 * one transaction: an approved inspection that failed to record what we owe
 * would be a phone in the cupboard and nothing in the books.
 */
adminRouter.post(
  "/inspections/:reference/complete",
  requireRole(Role.ADMIN, Role.AGENT),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          screenMatches: z.boolean(),
          noHiddenDamage: z.boolean(),
          batteryOk: z.boolean(),
          powersOn: z.boolean(),
          notIcloudLocked: z.boolean(),
          imeiClean: z.boolean(),
          imei: z.string().regex(/^\d{15}$/).optional(),
          gradeAssessed: z.nativeEnum(Grade),
          batteryActual: z.number().int().min(0).max(100).optional(),
          adjustedKobo: z.coerce.bigint().nonnegative().optional(),
          listPriceKobo: z.coerce.bigint().positive(),
          approve: z.boolean(),
          rejectReason: z.string().max(280).optional(),
          notes: z.string().max(1000).optional(),
        })
        .parse(req.body);

      const sale = await prisma.saleRequest.findUnique({
        where: { reference: req.params.reference ?? "" },
      });
      if (!sale) throw notFound("That inspection");
      if (sale.status !== SaleStatus.BOOKED && sale.status !== SaleStatus.INSPECTED) {
        throw conflict("That sale is not waiting on an inspection");
      }

      // These two are non-negotiable. A locked or blacklisted device is not
      // ours to resell no matter how clean the rest of the checklist looks.
      if (body.approve && (!body.notIcloudLocked || !body.imeiClean)) {
        throw badRequest("A device cannot be approved while it is locked or blacklisted");
      }

      const payable = body.adjustedKobo ?? sale.quotedKobo;

      const result = await prisma.$transaction(async (tx) => {
        const inspection = await tx.inspection.upsert({
          where: { saleRequestId: sale.id },
          create: {
            saleRequestId: sale.id,
            agentId: req.auth!.userId,
            screenMatches: body.screenMatches,
            noHiddenDamage: body.noHiddenDamage,
            batteryOk: body.batteryOk,
            powersOn: body.powersOn,
            notIcloudLocked: body.notIcloudLocked,
            imeiClean: body.imeiClean,
            imei: body.imei ?? null,
            gradeAssessed: body.gradeAssessed,
            batteryActual: body.batteryActual ?? null,
            adjustedKobo: payable,
            notes: body.notes ?? null,
            approvedAt: body.approve ? new Date() : null,
            rejectedAt: body.approve ? null : new Date(),
            rejectReason: body.approve ? null : (body.rejectReason ?? "Did not match description"),
          },
          update: {
            gradeAssessed: body.gradeAssessed,
            adjustedKobo: payable,
            approvedAt: body.approve ? new Date() : null,
            rejectedAt: body.approve ? null : new Date(),
          },
        });

        if (!body.approve) {
          await tx.saleRequest.update({
            where: { id: sale.id },
            data: { status: SaleStatus.REJECTED, finalKobo: null },
          });
          return { approved: false, listingReference: null };
        }

        const listing = await tx.listing.create({
          data: {
            reference: makeListingRef(),
            productId: sale.productId,
            tier: Tier.NG_USED,
            status: ListingStatus.LIVE,
            priceKobo: body.listPriceKobo,
            costKobo: payable,
            grade: body.gradeAssessed,
            batteryHealth: body.batteryActual ?? sale.claimedBattery,
            photos: sale.photos,
            sellerId: sale.sellerId,
            isCommission: sale.mode === SaleMode.COMMISSION,
            commissionBps: sale.mode === SaleMode.COMMISSION ? 1500 : null,
            publishedAt: new Date(),
          },
        });

        await tx.inspection.update({
          where: { id: inspection.id },
          data: { listingId: listing.id },
        });

        await tx.saleRequest.update({
          where: { id: sale.id },
          data: { status: SaleStatus.APPROVED, finalKobo: payable, listingId: listing.id },
        });

        // Direct purchase means we own it now and owe the seller. Commission
        // means nothing has moved yet, so nothing gets posted.
        if (sale.mode === SaleMode.DIRECT) {
          const sellerAccount = await ensureUserAccount(tx, sale.sellerId);
          await postJournal(tx, {
            reason: "device_purchased",
            description: `Bought ${listing.reference} from seller`,
            lines: [
              { accountCode: SYSTEM_ACCOUNTS.inventory.code, amountKobo: payable },
              { accountCode: sellerAccount, amountKobo: -payable },
            ],
          });
        }

        return { approved: true, listingReference: listing.reference };
      });

      await audit({
        actorId: req.auth!.userId,
        action: body.approve ? "inspection.approve" : "inspection.reject",
        entityType: "SaleRequest",
        entityId: sale.id,
        after: { payable: payable.toString(), grade: body.gradeAssessed },
        ip: req.ip,
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// -------------------------------------------------------------------- ledger

adminRouter.get("/ledger/trial-balance", requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const balance = await trialBalance(prisma);
    const accounts = await prisma.ledgerAccount.findMany({
      include: { entries: { select: { amountKobo: true } } },
      orderBy: { code: "asc" },
    });

    res.json({
      balanced: balance.balanced,
      delta: balance.delta.toString(),
      accounts: accounts.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        balance: money(a.entries.reduce<bigint>((s, e) => s + e.amountKobo, 0n)),
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/audit", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const q = z
      .object({
        entityType: z.string().max(40).optional(),
        entityId: z.string().max(40).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(q.entityType ? { entityType: q.entityType } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: q.limit,
      include: { actor: { select: { fullName: true, role: true } } },
    });

    res.json({
      logs: logs.map((l) => ({
        action: l.action,
        entity: `${l.entityType}:${l.entityId}`,
        actor: l.actor ? `${l.actor.fullName} (${l.actor.role})` : "system",
        before: l.before,
        after: l.after,
        at: l.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
