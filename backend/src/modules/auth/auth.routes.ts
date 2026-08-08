import { Router } from "express";
import { z } from "zod";
import * as service from "./auth.service.js";
import { authLimiter, otpLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/auth.js";
import { refreshCookieName, refreshCookieOptions } from "../../lib/tokens.js";
import { unauthorized } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export const authRouter = Router();

// Nigerian mobile numbers, normalised to E.164 before they hit the database.
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-()]/g, ""))
  .refine((v) => /^(\+?234|0)[789]\d{9}$/.test(v), "Enter a valid Nigerian phone number")
  .transform((v) => (v.startsWith("0") ? `+234${v.slice(1)}` : v.startsWith("+") ? v : `+${v}`));

const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
    "Include an uppercase letter, a lowercase letter and a number");

const ctxOf = (req: { headers: Record<string, unknown>; ip?: string }) => ({
  userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined,
  ip: req.ip,
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      fullName: z.string().trim().min(2).max(80),
      phone,
      email: z.string().email().toLowerCase().optional(),
      password,
    }).parse(req.body);

    const result = await service.register({ ...body, ctx: ctxOf(req) });
    res.cookie(refreshCookieName, result.refreshToken, refreshCookieOptions());
    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    });
  } catch (err) { next(err); }
});

authRouter.post("/login", authLimiter, async (req, res, next) => {
  try {
    const body = z.object({
      identifier: z.string().trim().min(3),
      password: z.string().min(1),
    }).parse(req.body);

    const result = await service.login({ ...body, ctx: ctxOf(req) });
    res.cookie(refreshCookieName, result.refreshToken, refreshCookieOptions());
    res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err) { next(err); }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[refreshCookieName];
    if (!token) throw unauthorized("Sign in again to continue");

    const result = await service.refresh(token, ctxOf(req));
    res.cookie(refreshCookieName, result.refreshToken, refreshCookieOptions());
    res.json({ user: result.user, accessToken: result.accessToken });
  } catch (err) {
    res.clearCookie(refreshCookieName, refreshCookieOptions());
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await service.logout(req.cookies?.[refreshCookieName]);
    res.clearCookie(refreshCookieName, refreshCookieOptions());
    res.status(204).end();
  } catch (err) { next(err); }
});

authRouter.post("/otp/send", otpLimiter, requireAuth, async (req, res, next) => {
  try {
    await service.requestPhaseOtp(req.auth!.userId);
    res.json({ sent: true });
  } catch (err) { next(err); }
});

authRouter.post("/otp/verify", authLimiter, requireAuth, async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    await service.verifyOtp(req.auth!.userId, code);
    res.json({ verified: true });
  } catch (err) { next(err); }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw unauthorized();
    res.json({ user: service.publicUser(user) });
  } catch (err) { next(err); }
});

authRouter.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await service.logoutEverywhere(req.auth!.userId);
    res.clearCookie(refreshCookieName, refreshCookieOptions());
    res.status(204).end();
  } catch (err) { next(err); }
});
