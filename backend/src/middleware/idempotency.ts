import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { sha256 } from "../lib/crypto.js";
import { badRequest, conflict, unauthorized } from "../lib/errors.js";

/**
 * Stops a double-tapped Pay button from becoming two orders.
 *
 * The client sends an Idempotency-Key header. First request through does the
 * work and we store the response. A repeat with the same key replays the
 * stored response instead of running the handler again.
 *
 * If the same key arrives with a different body, that is a client bug worth
 * shouting about, so it gets a 409 rather than silently returning the old
 * answer to a question nobody asked.
 */
export function idempotent(endpoint: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.header("Idempotency-Key");
      if (!key) {
        return next(badRequest("This request needs an Idempotency-Key header"));
      }
      if (key.length < 8 || key.length > 128) {
        return next(badRequest("Idempotency-Key must be between 8 and 128 characters"));
      }
      if (!req.auth) return next(unauthorized());

      const userId = req.auth.userId;
      const requestHash = sha256(JSON.stringify(req.body ?? {}));

      const existing = await prisma.idempotencyKey.findUnique({
        where: { key_userId_endpoint: { key, userId, endpoint } },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          return next(conflict("That idempotency key was already used with a different request"));
        }
        if (existing.responseBody && existing.statusCode) {
          res.setHeader("Idempotent-Replay", "true");
          return res.status(existing.statusCode).json(existing.responseBody);
        }
        // Row exists with no response yet: the original is still in flight.
        return next(conflict("That request is still being processed"));
      }

      // Claim the key before doing any work. The unique index means two
      // concurrent requests race here and exactly one wins.
      await prisma.idempotencyKey.create({
        data: { key, userId, endpoint, requestHash },
      });

      // Capture whatever the handler ends up sending so a retry can replay it.
      const originalJson = res.json.bind(res);
      res.json = ((body: unknown) => {
        void prisma.idempotencyKey
          .update({
            where: { key_userId_endpoint: { key, userId, endpoint } },
            data: { responseBody: body as never, statusCode: res.statusCode },
          })
          .catch(() => undefined);
        return originalJson(body);
      }) as Response["json"];

      next();
    } catch (err) {
      next(err);
    }
  };
}
