import { ListingStatus, OrderStatus, Grade } from "@prisma/client";
import { addMinutes } from "date-fns";
import { customAlphabet } from "nanoid";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { sum, type Kobo } from "../../lib/money.js";
import { tradeInCredit } from "../../lib/appraisal.js";

// No ambiguous characters. These references get read out over the phone to
// vendors and riders, and 0/O confusion wastes everyone's afternoon.
const makeRef = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 8);

export interface CreateOrderInput {
  userId: string;
  addressId?: string;
  items: Array<{ listingId: string; quantity: number }>;
  tradeIn?: {
    productId: string;
    grade: Grade;
    batteryHealth?: number;
    ageMonths: number;
  };
  deliveryKobo?: Kobo;
}

/**
 * Creates an order and takes the stock off the market.
 *
 * The reservation is the important part. Between "add to cart" and "payment
 * confirmed" there is a window where two people can both think they bought the
 * last iPhone. Reserving inside the same transaction that creates the order,
 * with a conditional update that only fires on a LIVE listing, means the
 * second request loses cleanly instead of overselling.
 */
export async function createOrder(input: CreateOrderInput) {
  if (input.items.length === 0) throw badRequest("Add something to your cart first");
  if (input.items.length > 20) throw badRequest("That is too many items for one order");

  return prisma.$transaction(async (tx) => {
    const listings = await tx.listing.findMany({
      where: { id: { in: input.items.map((i) => i.listingId) } },
      include: { product: true },
    });

    if (listings.length !== input.items.length) {
      throw notFound("One of those items");
    }

    const byId = new Map(listings.map((l) => [l.id, l]));
    const lineTotals: Kobo[] = [];

    for (const item of input.items) {
      const listing = byId.get(item.listingId)!;

      if (listing.status !== ListingStatus.LIVE) {
        throw conflict(`${listing.product.model} is no longer available`);
      }
      if (listing.stockCount < item.quantity) {
        throw conflict(`Only ${listing.stockCount} left of ${listing.product.model}`);
      }
      if (item.quantity < 1 || item.quantity > 5) {
        throw badRequest("Quantity must be between 1 and 5");
      }

      lineTotals.push(listing.priceKobo * BigInt(item.quantity));
    }

    const subtotalKobo = sum(lineTotals);
    const deliveryKobo = input.deliveryKobo ?? 0n;

    let tradeInKobo = 0n;
    let tradeInData: CreateOrderInput["tradeIn"] | undefined;

    if (input.tradeIn) {
      const product = await tx.product.findUnique({ where: { id: input.tradeIn.productId } });
      if (!product) throw notFound("That trade-in device");

      tradeInKobo = tradeInCredit({
        baseNewKobo: product.baseNewKobo,
        ageMonths: input.tradeIn.ageMonths,
        grade: input.tradeIn.grade,
        batteryHealth: input.tradeIn.batteryHealth ?? null,
        category: product.category,
      });

      // Credit can reduce a bill to nothing but never below it. We are not
      // paying someone to take a phone away.
      if (tradeInKobo > subtotalKobo) tradeInKobo = subtotalKobo;
      tradeInData = input.tradeIn;
    }

    const totalKobo = subtotalKobo - tradeInKobo + deliveryKobo;
    if (totalKobo < 0n) throw badRequest("That order total does not add up");

    const order = await tx.order.create({
      data: {
        reference: makeRef(),
        userId: input.userId,
        addressId: input.addressId ?? null,
        status: OrderStatus.PENDING_PAYMENT,
        subtotalKobo,
        tradeInKobo,
        deliveryKobo,
        totalKobo,
        reservedUntil: addMinutes(new Date(), env.ORDER_RESERVATION_MINUTES),
        items: {
          create: input.items.map((item) => {
            const listing = byId.get(item.listingId)!;
            return {
              listingId: listing.id,
              quantity: item.quantity,
              unitPriceKobo: listing.priceKobo,
              unitCostKobo: listing.costKobo,
              titleSnapshot: [listing.product.brand, listing.product.model, listing.product.variant]
                .filter(Boolean)
                .join(" "),
            };
          }),
        },
        ...(tradeInData
          ? {
              tradeIn: {
                create: {
                  productId: tradeInData.productId,
                  claimedGrade: tradeInData.grade,
                  claimedBattery: tradeInData.batteryHealth ?? null,
                  creditKobo: tradeInKobo,
                },
              },
            }
          : {}),
      },
      include: { items: true },
    });

    // Conditional reservation. updateMany with status: LIVE in the where means
    // a racing request updates zero rows and we can detect it.
    for (const item of input.items) {
      const reserved = await tx.listing.updateMany({
        where: {
          id: item.listingId,
          status: ListingStatus.LIVE,
          stockCount: { gte: item.quantity },
        },
        data: { status: ListingStatus.RESERVED },
      });
      if (reserved.count === 0) {
        throw conflict("Someone just took that one. Try another.");
      }
    }

    await tx.orderEvent.create({
      data: { orderId: order.id, status: OrderStatus.PENDING_PAYMENT, note: "Order created" },
    });

    return order;
  });
}

export async function getOrderForUser(reference: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { reference },
    include: {
      items: { include: { listing: { include: { product: true } } } },
      address: true,
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      tradeIn: true,
    },
  });

  // Same response for "not yours" and "does not exist". Returning 403 tells
  // the caller the reference is real, which is a small leak worth closing.
  if (!order || order.userId !== userId) throw notFound("That order");
  return order;
}

export async function advanceStatus(opts: {
  orderId: string;
  status: OrderStatus;
  actorId: string;
  note?: string;
}) {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
    [OrderStatus.PAID]: [OrderStatus.SOURCING, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    [OrderStatus.SOURCING]: [OrderStatus.READY, OrderStatus.CANCELLED],
    [OrderStatus.READY]: [OrderStatus.IN_TRANSIT, OrderStatus.CANCELLED],
    [OrderStatus.IN_TRANSIT]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.REFUNDED]: [],
  };

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: opts.orderId } });
    if (!order) throw notFound("That order");

    if (!allowed[order.status].includes(opts.status)) {
      throw conflict(`An order that is ${order.status} cannot move to ${opts.status}`);
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: opts.status,
        ...(opts.status === OrderStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
        ...(opts.status === OrderStatus.CANCELLED ? { cancelledAt: new Date() } : {}),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        status: opts.status,
        note: opts.note ?? null,
        actorId: opts.actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: opts.actorId,
        action: "order.status_change",
        entityType: "Order",
        entityId: order.id,
        before: { status: order.status } as never,
        after: { status: opts.status } as never,
      },
    });

    return updated;
  });
}
