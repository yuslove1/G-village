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
import { startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { money, maybeMoney } from "../../lib/serialize.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { advanceStatus } from "../orders/order.service.js";
import { ensureUserAccount, postJournal, SYSTEM_ACCOUNTS, trialBalance } from "../../lib/ledger.js";
import { hashPassword, randomToken } from "../../lib/crypto.js";
import { notifyMatchingAlerts } from "../alerts/alert.service.js";
import { logger } from "../../lib/logger.js";

export const adminRouter = Router();
const makeListingRef = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

// Same shape as auth.routes.ts's phone field — duplicated rather than shared
// because that one lives in a request-parsing module, not a lib.
const staffPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-()]/g, ""))
  .refine((v) => /^(\+?234|0)[789]\d{9}$/.test(v), "Enter a valid Nigerian phone number")
  .transform((v) => (v.startsWith("0") ? `+234${v.slice(1)}` : v.startsWith("+") ? v : `+${v}`));

// Guarantees the complexity rule login's password field enforces (upper,
// lower, digit, 10+ chars) without relying on a random draw to get lucky.
function generateTempPassword(): string {
  return `Gv1${randomToken(9)}Ab2`;
}

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
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [paidToday, toFulfil, inspections, pendingPayouts, books, sourcingOrders, todaysPickups, unpaidSales] =
      await Promise.all([
        prisma.order.aggregate({
          where: { status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] }, createdAt: { gte: dayStart } },
          _sum: { totalKobo: true },
          _count: true,
        }),
        prisma.order.count({ where: { status: { in: [OrderStatus.PAID, OrderStatus.SOURCING] } } }),
        prisma.saleRequest.count({ where: { status: SaleStatus.BOOKED } }),
        prisma.saleRequest.count({ where: { status: SaleStatus.APPROVED } }),
        trialBalance(prisma),
        // "Confirm vendor price" — a paid order still waiting to be marked
        // sourced from a vendor (admin/orders' "Mark sourced" action).
        prisma.order.findMany({
          where: { status: OrderStatus.PAID },
          orderBy: { createdAt: "asc" },
          take: 5,
          include: { items: { take: 1, include: { listing: { include: { product: true } } } } },
        }),
        prisma.saleRequest.findMany({
          where: { status: SaleStatus.BOOKED, pickupAt: { gte: dayStart, lt: dayEnd } },
          orderBy: { pickupAt: "asc" },
          take: 5,
        }),
        prisma.saleRequest.findMany({
          where: { status: SaleStatus.APPROVED, mode: SaleMode.DIRECT },
          orderBy: { updatedAt: "asc" },
          take: 5,
        }),
      ]);

    const pickupProductIds = todaysPickups.map((s) => s.productId);
    const unpaidProductIds = unpaidSales.map((s) => s.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: [...pickupProductIds, ...unpaidProductIds] } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const deviceTitle = (productId: string) => {
      const p = productById.get(productId);
      return p ? [p.brand, p.model, p.variant].filter(Boolean).join(" ") : "Device";
    };

    const actions = [
      ...sourcingOrders.map((o) => ({
        type: "confirm_sourcing" as const,
        label: "Confirm vendor price",
        detail: `${o.items[0]?.titleSnapshot ?? "Order"} · Order #${o.reference}`,
        href: `/admin/orders/${o.reference}`,
        urgency: "urgent" as const,
      })),
      ...todaysPickups.map((s) => ({
        type: "inspect" as const,
        label: "Inspect device",
        detail: `${deviceTitle(s.productId)} · Pickup today`,
        href: `/admin/inspections`,
        urgency: "today" as const,
      })),
      ...unpaidSales.map((s) => ({
        type: "pay_seller" as const,
        label: "Pay seller",
        detail: `${deviceTitle(s.productId)} · ${money(s.finalKobo ?? s.quotedKobo).display}`,
        href: `/admin/payouts`,
        urgency: "due" as const,
      })),
    ];

    res.json({
      today: {
        revenue: money(paidToday._sum.totalKobo ?? 0n),
        orders: paidToday._count,
      },
      queues: { toFulfil, inspections, pendingPayouts },
      ledger: { balanced: books.balanced, delta: books.delta.toString() },
      actions,
    });
  } catch (err) {
    next(err);
  }
});

// Sellers with an outstanding balance — the admin-facing view of who is owed
// money. The actual withdrawal is always seller-initiated from /sell/payout
// (they own the bank details and the auth to move their own money); this is
// visibility only, so ops can see who's waiting and nudge them if a balance
// sits unpaid for a while.
adminRouter.get("/payouts", requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const accounts = await prisma.ledgerAccount.findMany({
      where: { userId: { not: null } },
      include: {
        entries: { select: { amountKobo: true } },
        user: { select: { fullName: true, phone: true } },
      },
    });

    const owed = accounts
      .filter((a) => a.user)
      .map((a) => ({
        userId: a.userId!,
        name: a.user!.fullName,
        phone: a.user!.phone,
        balance: -a.entries.reduce<bigint>((s, e) => s + e.amountKobo, 0n),
      }))
      .filter((a) => a.balance > 0n)
      .sort((a, b) => (a.balance < b.balance ? 1 : a.balance > b.balance ? -1 : 0));

    const withAccount = await prisma.payoutAccount.findMany({
      where: { userId: { in: owed.map((o) => o.userId) }, isDefault: true },
      select: { userId: true },
    });
    const hasAccount = new Set(withAccount.map((a) => a.userId));

    res.json({
      sellers: owed.map((o) => ({
        userId: o.userId,
        name: o.name,
        phone: o.phone,
        balance: money(o.balance),
        hasPayoutAccount: hasAccount.has(o.userId),
      })),
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
          vendorPhone: o.items[0]?.listing.vendor?.phone ?? null,
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

adminRouter.get("/listings", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const q = z
      .object({
        q: z.string().trim().max(120).optional(),
        status: z.enum(["live", "low", "draft"]).optional(),
      })
      .parse(req.query);

    const rows = await prisma.listing.findMany({
      where: {
        status: q.status === "draft" ? ListingStatus.DRAFT : { not: ListingStatus.DRAFT },
        ...(q.q
          ? {
              product: {
                OR: [
                  { model: { contains: q.q, mode: "insensitive" as const } },
                  { brand: { contains: q.q, mode: "insensitive" as const } },
                ],
              },
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { product: true, vendor: true },
    });

    // Low stock is a display filter, not a database predicate — "low" is
    // relative to nothing stored, so it is cheaper to filter the (already
    // small) admin result set in memory than to invent a threshold column.
    const filtered = q.status === "low" ? rows.filter((l) => l.stockCount > 0 && l.stockCount <= 2) : rows;

    res.json({
      listings: filtered.map((l) => ({
        reference: l.reference,
        title: [l.product.brand, l.product.model, l.product.variant].filter(Boolean).join(" "),
        tier: l.tier,
        status: l.status,
        stockCount: l.stockCount,
        price: money(l.priceKobo),
        vendor: l.vendor?.businessName ?? "Own stock",
        updatedAt: l.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

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

    if (body.publish) {
      void notifyMatchingAlerts(listing.id).catch((err) => logger.error({ err }, "alert notify failed"));
    }

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

    const firstPublish = body.status === ListingStatus.LIVE && !before.publishedAt;

    const listing = await prisma.listing.update({
      where: { id: before.id },
      data: {
        ...body,
        ...(firstPublish ? { publishedAt: new Date() } : {}),
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

    if (firstPublish) {
      void notifyMatchingAlerts(listing.id).catch((err) => logger.error({ err }, "alert notify failed"));
    }

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

// Soft delete — isActive:false, same convention as the field already carries
// for "vendor we no longer source from." Their past listings and sold-unit
// history stay attached and correct; they just drop off the active list and
// can no longer be picked for new stock.
adminRouter.delete("/vendors/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const existing = await prisma.vendor.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || !existing.isActive) throw notFound("That vendor");

    await prisma.vendor.update({ where: { id: existing.id }, data: { isActive: false } });
    await audit({
      actorId: req.auth!.userId,
      action: "vendor.deactivate",
      entityType: "Vendor",
      entityId: existing.id,
      before: { isActive: true },
      after: { isActive: false },
      ip: req.ip,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Soft delete via the User.deletedAt every other part of the app already
// respects, not a hard row delete — an agent's Inspection history is real
// financial record, not something a removal should orphan or cascade away.
// Anything still open in their queue goes back to the unassigned pool rather
// than sitting assigned to someone who can no longer act on it.
adminRouter.delete("/agents/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const agent = await prisma.user.findUnique({ where: { id: req.params.id ?? "" } });
    if (!agent || agent.role !== Role.AGENT || agent.deletedAt) throw notFound("That agent");

    await prisma.$transaction([
      prisma.user.update({ where: { id: agent.id }, data: { deletedAt: new Date() } }),
      prisma.saleRequest.updateMany({
        where: { assignedAgentId: agent.id, status: { in: [SaleStatus.BOOKED, SaleStatus.INSPECTED] } },
        data: { assignedAgentId: null },
      }),
    ]);

    await audit({
      actorId: req.auth!.userId,
      action: "agent.remove",
      entityType: "User",
      entityId: agent.id,
      before: { deletedAt: null },
      after: { deletedAt: new Date().toISOString() },
      ip: req.ip,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ checklist

// Read is ADMIN+AGENT — an agent needs today's active list to run an
// inspection. Writes are ADMIN only.
adminRouter.get("/checklist-items", requireRole(Role.ADMIN, Role.AGENT), async (_req, res, next) => {
  try {
    const items = await prisma.checklistItem.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    res.json({ items: items.map((i) => ({ id: i.id, label: i.label, order: i.order })) });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/checklist-items", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({ label: z.string().trim().min(2).max(160) }).parse(req.body);

    const top = await prisma.checklistItem.aggregate({ _max: { order: true } });
    const item = await prisma.checklistItem.create({
      data: { label: body.label, order: (top._max.order ?? -1) + 1 },
    });

    await audit({
      actorId: req.auth!.userId,
      action: "checklist_item.create",
      entityType: "ChecklistItem",
      entityId: item.id,
      after: { label: item.label },
      ip: req.ip,
    });

    res.status(201).json({ item: { id: item.id, label: item.label, order: item.order } });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/checklist-items/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const existing = await prisma.checklistItem.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || !existing.isActive) throw notFound("That checklist item");

    await prisma.checklistItem.update({ where: { id: existing.id }, data: { isActive: false } });
    await audit({
      actorId: req.auth!.userId,
      action: "checklist_item.deactivate",
      entityType: "ChecklistItem",
      entityId: existing.id,
      before: { isActive: true },
      after: { isActive: false },
      ip: req.ip,
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- inspections

adminRouter.get("/inspections", requireRole(Role.ADMIN, Role.AGENT), async (req, res, next) => {
  try {
    // Admin sees the whole board to route work; an agent only sees the open
    // pool plus whatever is exclusively theirs — never another agent's
    // assigned booking. requireRole already guarantees one of these two.
    const scope =
      req.auth!.role === Role.ADMIN
        ? {}
        : { OR: [{ assignedAgentId: null }, { assignedAgentId: req.auth!.userId }] };

    const sales = await prisma.saleRequest.findMany({
      where: { status: { in: [SaleStatus.BOOKED, SaleStatus.INSPECTED] }, ...scope },
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

    const userIds = [...sales.map((s) => s.sellerId), ...sales.map((s) => s.assignedAgentId).filter((id): id is string => Boolean(id))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, phone: true, city: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    res.json({
      inspections: sales.map((s) => {
        const p = byId.get(s.productId);
        const seller = userById.get(s.sellerId);
        const agent = s.assignedAgentId ? userById.get(s.assignedAgentId) : null;
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
          seller: seller ? { name: seller.fullName, phone: seller.phone, city: seller.city } : null,
          assignedAgent: agent ? { id: agent.id, name: agent.fullName } : null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/inspections/:reference/assign", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { agentId } = z.object({ agentId: z.string().cuid() }).parse(req.body);

    const agent = await prisma.user.findUnique({ where: { id: agentId } });
    if (!agent || (agent.role !== Role.AGENT && agent.role !== Role.ADMIN)) {
      throw badRequest("That user isn't an agent");
    }

    const sale = await prisma.saleRequest.findUnique({ where: { reference: req.params.reference ?? "" } });
    if (!sale) throw notFound("That booking");

    await prisma.saleRequest.update({ where: { id: sale.id }, data: { assignedAgentId: agentId } });

    await audit({
      actorId: req.auth!.userId,
      action: "inspection.assign",
      entityType: "SaleRequest",
      entityId: sale.id,
      after: { assignedAgentId: agentId },
      ip: req.ip,
    });

    res.json({ assigned: true });
  } catch (err) {
    next(err);
  }
});

// Self-claim from the open pool. Race-safe: the conditional update only
// succeeds while assignedAgentId is still null, so two agents claiming the
// same booking at once can't both win it — the loser's updateMany touches
// zero rows and gets a clear conflict instead of silently overwriting.
adminRouter.post("/inspections/:reference/claim", requireRole(Role.ADMIN, Role.AGENT), async (req, res, next) => {
  try {
    const sale = await prisma.saleRequest.findUnique({ where: { reference: req.params.reference ?? "" } });
    if (!sale) throw notFound("That booking");

    const result = await prisma.saleRequest.updateMany({
      where: { id: sale.id, assignedAgentId: null },
      data: { assignedAgentId: req.auth!.userId },
    });

    if (result.count === 0) throw conflict("Someone already claimed that one");

    res.json({ claimed: true });
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
          checklistResults: z
            .array(z.object({ itemId: z.string().cuid(), passed: z.boolean() }))
            .default([]),
        })
        .parse(req.body);

      const sale = await prisma.saleRequest.findUnique({
        where: { reference: req.params.reference ?? "" },
      });
      if (!sale) throw notFound("That inspection");

      let publishedListingId: string | null = null;
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

        // Recorded either way — a custom item can be relevant to a rejection
        // too. Clear-and-reinsert rather than per-row upsert since this is a
        // full resubmission of "what the agent has checked so far," not an
        // incremental patch.
        if (body.checklistResults.length > 0) {
          await tx.inspectionChecklistResult.deleteMany({ where: { inspectionId: inspection.id } });
          await tx.inspectionChecklistResult.createMany({
            data: body.checklistResults.map((r) => ({
              inspectionId: inspection.id,
              checklistItemId: r.itemId,
              passed: r.passed,
            })),
          });
        }

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

        publishedListingId = listing.id;
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

      if (publishedListingId) {
        void notifyMatchingAlerts(publishedListingId).catch((err) => logger.error({ err }, "alert notify failed"));
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ----------------------------------------------------------------- analytics

adminRouter.get("/analytics", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const days = z.coerce.number().int().min(1).max(3650).default(30).parse(req.query.days ?? 30);
    const since = new Date(Date.now() - days * 86_400_000);
    const prevSince = new Date(since.getTime() - days * 86_400_000);

    const paidStatuses = { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] as OrderStatus[] };

    const [orders, prevRevenue] = await Promise.all([
      prisma.order.findMany({
        where: { status: paidStatuses, createdAt: { gte: since } },
        include: { items: { include: { listing: { include: { product: true } } } } },
      }),
      prisma.order.aggregate({
        where: { status: paidStatuses, createdAt: { gte: prevSince, lt: since } },
        _sum: { totalKobo: true },
      }),
    ]);

    let revenue = 0n;
    let cost = 0n;
    const bySeller = new Map<string, { model: string; units: number; margin: bigint }>();
    const byDay = new Map<string, bigint>();

    for (const order of orders) {
      const dayKey = order.createdAt.toISOString().slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) ?? 0n) + order.totalKobo);

      for (const item of order.items) {
        const lineRevenue = item.unitPriceKobo * BigInt(item.quantity);
        const lineCost = (item.unitCostKobo ?? 0n) * BigInt(item.quantity);
        revenue += lineRevenue;
        cost += lineCost;

        const key = item.listing.product.model;
        const row = bySeller.get(key) ?? { model: key, units: 0, margin: 0n };
        row.units += item.quantity;
        row.margin += lineRevenue - lineCost;
        bySeller.set(key, row);
      }
    }

    const margin = revenue - cost;
    const prevTotal = prevRevenue._sum.totalKobo ?? 0n;
    const growthPercent = prevTotal > 0n ? (Number(((revenue - prevTotal) * 10000n) / prevTotal) / 100) : null;

    res.json({
      revenue: money(revenue),
      margin: money(margin),
      marginPercent: revenue > 0n ? (Number((margin * 10000n) / revenue) / 100).toFixed(1) : "0.0",
      orderCount: orders.length,
      avgOrder: orders.length > 0 ? money(revenue / BigInt(orders.length)) : money(0n),
      growthPercent,
      // Daily buckets built from the same order set above, not a second
      // query — the dashboard's date range is never large enough (this is
      // a single-vendor operation, not a high-volume marketplace) for a
      // per-day GROUP BY to be worth a round trip of its own.
      revenueSeries: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, kobo]) => ({ date, revenue: money(kobo) })),
      topSellers: [...bySeller.values()]
        .sort((a, b) => b.units - a.units)
        .slice(0, 5)
        .map((s) => ({ model: s.model, unitsSold: s.units, margin: money(s.margin) })),
    });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------agents

adminRouter.get("/agents", requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: Role.AGENT, deletedAt: null },
      orderBy: { fullName: "asc" },
    });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [counts, totalCounts] = await Promise.all([
      prisma.inspection.groupBy({
        by: ["agentId"],
        where: { createdAt: { gte: monthStart } },
        _count: { _all: true },
      }),
      prisma.inspection.groupBy({ by: ["agentId"], _count: { _all: true } }),
    ]);
    const countByAgent = new Map(counts.map((c) => [c.agentId, c._count._all]));
    const totalByAgent = new Map(totalCounts.map((c) => [c.agentId, c._count._all]));

    res.json({
      agents: agents.map((a) => ({
        id: a.id,
        fullName: a.fullName,
        city: a.city,
        state: a.state,
        inspectionsThisMonth: countByAgent.get(a.id) ?? 0,
        // Onboarding until their first inspection, same idea as the design's
        // status pill — not a stored field, just "have they done anything yet."
        status: (totalByAgent.get(a.id) ?? 0) > 0 ? "ACTIVE" : "ONBOARDING",
      })),
    });
  } catch (err) {
    next(err);
  }
});

// The only way an agent (or a second admin) account gets created — self-serve
// registration always lands on Role.BUYER. There is no SMS/email provider
// wired up to hand the new hire their password (same limitation OTP delivery
// already has), so the temp password comes back in this response, once, for
// whoever is running onboarding to relay directly.
adminRouter.post("/agents", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z
      .object({
        fullName: z.string().trim().min(2).max(80),
        phone: staffPhone,
        email: z.string().trim().email().toLowerCase().optional(),
        city: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        role: z.enum([Role.AGENT, Role.ADMIN]).default(Role.AGENT),
      })
      .parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ phone: body.phone }, ...(body.email ? [{ email: body.email }] : [])] },
      select: { id: true },
    });
    if (existing) throw conflict("An account with those details already exists");

    const tempPassword = generateTempPassword();
    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        phone: body.phone,
        email: body.email ?? null,
        passwordHash: await hashPassword(tempPassword),
        role: body.role,
        city: body.city ?? null,
        state: body.state ?? null,
      },
    });

    await audit({
      actorId: req.auth!.userId,
      action: "agent.create",
      entityType: "User",
      entityId: user.id,
      after: { role: user.role, phone: user.phone },
      ip: req.ip,
    });

    res.status(201).json({
      agent: { id: user.id, fullName: user.fullName, phone: user.phone, role: user.role },
      tempPassword,
    });
  } catch (err) {
    next(err);
  }
});

// An agent's own dashboard — scoped to req.auth so one agent can never pull
// another's numbers, unlike GET /agents which is the admin's board of
// everyone. "Completed" means approvedAt or rejectedAt is set: an inspection
// claimed but not yet finished counts in the queue, not here.
adminRouter.get("/agents/me", requireRole(Role.ADMIN, Role.AGENT), async (req, res, next) => {
  try {
    const agentId = req.auth!.userId;
    const now = new Date();
    const dayStart = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const completedSince = (since: Date) =>
      prisma.inspection.count({
        where: { agentId, OR: [{ approvedAt: { gte: since } }, { rejectedAt: { gte: since } }] },
      });

    const [today, thisWeek, monthApproved, monthRejected, assignedToMe, openForClaim] = await Promise.all([
      completedSince(dayStart),
      completedSince(weekStart),
      prisma.inspection.count({ where: { agentId, approvedAt: { gte: monthStart } } }),
      prisma.inspection.count({ where: { agentId, rejectedAt: { gte: monthStart } } }),
      prisma.saleRequest.count({
        where: { assignedAgentId: agentId, status: { in: [SaleStatus.BOOKED, SaleStatus.INSPECTED] } },
      }),
      prisma.saleRequest.count({
        where: { assignedAgentId: null, status: { in: [SaleStatus.BOOKED, SaleStatus.INSPECTED] } },
      }),
    ]);

    res.json({
      today: { completed: today },
      thisWeek: { completed: thisWeek },
      thisMonth: {
        completed: monthApproved + monthRejected,
        approved: monthApproved,
        rejected: monthRejected,
      },
      queue: { assignedToMe, openForClaim },
    });
  } catch (err) {
    next(err);
  }
});

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
