import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { verifyAccessToken } from "../lib/tokens.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role; sessionId: string };
    }
  }
}

/**
 * Access tokens are short lived, but "short" is not "immediate". Checking the
 * session row on every request means a logout or a forced revocation takes
 * effect now rather than up to fifteen minutes from now. The extra query is
 * worth it on a platform holding other people's money.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();

    const token = header.slice(7).trim();
    if (!token) throw unauthorized();

    const claims = await verifyAccessToken(token).catch(() => {
      throw unauthorized("Your session has expired");
    });

    const session = await prisma.session.findUnique({
      where: { id: claims.sid },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized("Your session has expired");
    }
    if (session.userId !== claims.sub) throw unauthorized();

    req.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches auth when present, but does not demand it. */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.headers.authorization) return next();
  return requireAuth(req, res, (err) => (err ? next() : next()));
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}

/**
 * Ownership check. The most common real world API bug is letting someone read
 * /orders/:id for an order that is not theirs, so this is a helper rather than
 * something each route reimplements and occasionally forgets.
 */
export function requireOwnershipOr(...roles: Role[]) {
  return (ownerId: string) => (req: Request) => {
    if (!req.auth) throw unauthorized();
    if (req.auth.userId === ownerId) return;
    if (roles.includes(req.auth.role)) return;
    throw forbidden();
  };
}
