import express from "express";
import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { generalLimiter } from "./middleware/rateLimit.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { webhookRouter } from "./modules/payments/webhook.routes.js";
import { paymentMethodsRouter } from "./modules/payments/payment-methods.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { orderRouter } from "./modules/orders/order.routes.js";
import { saleRouter } from "./modules/sales/sale.routes.js";
import { alertRouter } from "./modules/alerts/alert.routes.js";
import { addressRouter } from "./modules/addresses/address.routes.js";
import { wishlistRouter } from "./modules/wishlist/wishlist.routes.js";
import { payoutRouter } from "./modules/payouts/payout.routes.js";
import { uploadRouter } from "./modules/uploads/upload.routes.js";
import { uploadsDir } from "./lib/storage.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { prisma } from "./lib/prisma.js";
import { trialBalance } from "./lib/ledger.js";

export function createApp() {
  const app = express();

  // Behind a load balancer, req.ip is the proxy unless this is set, which
  // would make every rate limit key identical.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://js.paystack.co"],
          frameSrc: ["'self'", "https://checkout.paystack.com"],
          connectSrc: ["'self'", "https://api.paystack.co"],
          imgSrc: ["'self'", "data:", "https:"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: env.isProd ? [] : null,
        },
      },
      hsts: env.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

  app.use(
    cors({
      origin(origin, cb) {
        // Server to server calls and curl have no Origin header.
        if (!origin) return cb(null, true);
        if (env.corsOrigins.includes(origin)) return cb(null, true);
        cb(new Error("Origin not allowed"));
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      maxAge: 86400,
    }),
  );

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  // Webhooks mount before the JSON parser. Signature verification needs the
  // exact bytes Paystack sent, and express.json would consume them first.
  app.use("/api/v1/webhooks", webhookRouter);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());
  app.use(hpp()); // collapses ?role=buyer&role=admin into a single value

  app.get("/health", (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

  // Local-disk fallback for uploaded photos when CLOUDINARY_URL isn't set
  // (see lib/storage.ts). Harmless to leave mounted once Cloudinary takes
  // over — the directory just stops receiving new files. Immutable
  // filenames mean a long cache lifetime never goes stale.
  app.use("/uploads", express.static(uploadsDir, { maxAge: "30d", immutable: true }));

  // Deep check. Confirms the database answers and the books still balance,
  // which is the one invariant worth alerting on.
  app.get("/health/deep", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const balance = await trialBalance(prisma);
      res.status(balance.balanced ? 200 : 500).json({
        ok: balance.balanced,
        database: "up",
        ledgerBalanced: balance.balanced,
        ledgerDelta: balance.delta.toString(),
      });
    } catch (err) {
      logger.error({ err }, "deep health check failed");
      res.status(503).json({ ok: false });
    }
  });

  app.use("/api/v1", generalLimiter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/catalog", catalogRouter);
  app.use("/api/v1/orders", orderRouter);
  app.use("/api/v1/sales", saleRouter);
  app.use("/api/v1/alerts", alertRouter);
  app.use("/api/v1/addresses", addressRouter);
  app.use("/api/v1/wishlist", wishlistRouter);
  app.use("/api/v1/payouts", payoutRouter);
  app.use("/api/v1/payment-methods", paymentMethodsRouter);
  app.use("/api/v1/uploads", uploadRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
