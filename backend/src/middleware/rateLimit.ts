import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env.js";

/**
 * Limits are per route family, not one global bucket. A shared bucket means a
 * bot hammering login can lock everyone out of browsing, which is a denial of
 * service you built yourself.
 *
 * Keyed on user id when signed in, IP otherwise. Behind a proxy this needs
 * `app.set("trust proxy", 1)` or every request looks like it came from the
 * load balancer.
 */
function keyFor(req: Request): string {
  return req.auth?.userId ?? req.ip ?? "unknown";
}

const base: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: keyFor,
  message: {
    error: { code: "rate_limited", message: "Too many attempts. Wait a moment and try again." },
  },
};

/** Broad protection for everything else. */
export const generalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: env.isProd ? 120 : 1000,
});

/** Login, signup, password reset. Tight, because these are what get attacked. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: env.isProd ? 10 : 100,
  skipSuccessfulRequests: true, // a person logging in correctly is not a threat
});

/** OTP send. Expensive per call and abusable as an SMS bomb. */
export const otpLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: env.isProd ? 5 : 50,
});

/** Payment initiation. Slow enough to make card testing pointless. */
export const paymentLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: env.isProd ? 8 : 100,
});

/** Appraisal quotes. Free to request, so worth capping. */
export const quoteLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: env.isProd ? 30 : 300,
});
