import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { notFound } from "../../lib/errors.js";

export const paymentMethodsRouter = Router();

paymentMethodsRouter.use(requireAuth);

// authorizationCode never leaves this file. Every response here is the
// masked view a buyer would recognise their own card from — never anything
// that could be replayed to charge it.
interface SavedCardRow {
  id: string;
  last4: string;
  expMonth: string;
  expYear: string;
  cardType: string;
  bank: string | null;
  isDefault: boolean;
}

function toCardDto(c: SavedCardRow) {
  return {
    id: c.id,
    last4: c.last4,
    expMonth: c.expMonth,
    expYear: c.expYear,
    cardType: c.cardType,
    bank: c.bank,
    isDefault: c.isDefault,
  };
}

paymentMethodsRouter.get("/", async (req, res, next) => {
  try {
    const cards = await prisma.savedCard.findMany({
      where: { userId: req.auth!.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ cards: cards.map(toCardDto) });
  } catch (err) {
    next(err);
  }
});

paymentMethodsRouter.patch("/:id/default", async (req, res, next) => {
  try {
    const existing = await prisma.savedCard.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId) throw notFound("That saved card");

    await prisma.$transaction([
      prisma.savedCard.updateMany({
        where: { userId: req.auth!.userId },
        data: { isDefault: false },
      }),
      prisma.savedCard.update({ where: { id: existing.id }, data: { isDefault: true } }),
    ]);

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

paymentMethodsRouter.delete("/:id", async (req, res, next) => {
  try {
    const existing = await prisma.savedCard.findUnique({ where: { id: req.params.id ?? "" } });
    if (!existing || existing.userId !== req.auth!.userId) throw notFound("That saved card");

    await prisma.savedCard.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
