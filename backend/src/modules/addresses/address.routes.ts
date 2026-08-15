import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { badRequest, notFound } from "../../lib/errors.js";

export const addressRouter = Router();

addressRouter.use(requireAuth);

const bodySchema = z.object({
  label: z.string().trim().min(1).max(40),
  line1: z.string().trim().min(4).max(200),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  phone: z.string().trim().min(7).max(20),
  isDefault: z.boolean().default(false),
});

addressRouter.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.address.findMany({
      where: { userId: req.auth!.userId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ addresses: rows.map(toAddressDto) });
  } catch (err) {
    next(err);
  }
});

addressRouter.post("/", async (req, res, next) => {
  try {
    const body = bodySchema.parse(req.body);

    const address = await prisma.$transaction(async (tx) => {
      // First address a user ever adds is the default whether they ticked
      // the box or not — there is no meaningful "pick a delivery address"
      // screen with zero options on it.
      const existingCount = await tx.address.count({
        where: { userId: req.auth!.userId, deletedAt: null },
      });
      const isDefault = body.isDefault || existingCount === 0;

      if (isDefault) {
        await tx.address.updateMany({
          where: { userId: req.auth!.userId, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: { ...body, isDefault, userId: req.auth!.userId },
      });
    });

    res.status(201).json({ address: toAddressDto(address) });
  } catch (err) {
    next(err);
  }
});

const updateSchema = bodySchema.partial();

addressRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw badRequest("Nothing to update");

    const existing = await prisma.address.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId || existing.deletedAt) {
      throw notFound("That address");
    }

    const address = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.address.updateMany({
          where: { userId: req.auth!.userId, deletedAt: null, id: { not: existing.id } },
          data: { isDefault: false },
        });
      }
      return tx.address.update({ where: { id: existing.id }, data: body });
    });

    res.json({ address: toAddressDto(address) });
  } catch (err) {
    next(err);
  }
});

addressRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.address.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId || existing.deletedAt) {
      throw notFound("That address");
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.update({ where: { id: existing.id }, data: { deletedAt: new Date(), isDefault: false } });

      // Deleting the default hands the role to whichever address is left,
      // so checkout never has to cope with zero addresses having one.
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId: req.auth!.userId, deletedAt: null },
          orderBy: { createdAt: "desc" },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

interface AddressRow {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  phone: string;
  isDefault: boolean;
  createdAt: Date;
}

function toAddressDto(a: AddressRow) {
  return {
    id: a.id,
    label: a.label,
    line1: a.line1,
    city: a.city,
    state: a.state,
    phone: a.phone,
    isDefault: a.isDefault,
    createdAt: a.createdAt,
  };
}
