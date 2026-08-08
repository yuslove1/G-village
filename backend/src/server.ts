import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { disconnectPrisma } from "./lib/prisma.js";
import { startJobs, stopJobs } from "./jobs/index.js";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "gadgetvillage api listening");
  startJobs();
});

/**
 * Graceful shutdown. A hard kill mid-transaction on a payments service is how
 * you end up with an order marked paid and no ledger entry behind it.
 */
function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  stopJobs();
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("forced exit after timeout");
    process.exit(1);
  }, 15_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled rejection");
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  shutdown("uncaughtException");
});
