import { logger } from "../lib/logger.js";
import { expireStaleReservations } from "../modules/payments/payment.service.js";
import { replayFailedWebhooks } from "../modules/payments/webhook.routes.js";
import { prisma } from "../lib/prisma.js";
import { trialBalance } from "../lib/ledger.js";

/**
 * In-process timers. Fine for a single instance, which is where this starts.
 * The moment it runs on more than one box these need a lock or a real queue,
 * otherwise every instance does the same work at the same moment.
 */
const timers: NodeJS.Timeout[] = [];

function every(ms: number, name: string, fn: () => Promise<unknown>) {
  const t = setInterval(() => {
    fn().catch((err) => logger.error({ err, job: name }, "scheduled job failed"));
  }, ms);
  t.unref();
  timers.push(t);
}

export function startJobs() {
  every(60_000, "expire-reservations", async () => {
    const n = await expireStaleReservations();
    if (n) logger.info({ released: n }, "released expired reservations");
  });

  every(5 * 60_000, "replay-webhooks", async () => {
    const n = await replayFailedWebhooks();
    if (n) logger.info({ recovered: n }, "recovered stuck webhooks");
  });

  // If the books stop balancing that is a stop-the-line problem. Better to
  // hear it from a log line tonight than from a customer next month.
  every(15 * 60_000, "trial-balance", async () => {
    const b = await trialBalance(prisma);
    if (!b.balanced) logger.fatal({ delta: b.delta.toString() }, "LEDGER OUT OF BALANCE");
  });

  every(6 * 60 * 60_000, "prune-idempotency", async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const { count } = await prisma.idempotencyKey.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (count) logger.info({ count }, "pruned idempotency keys");
  });

  logger.info({ jobs: timers.length }, "background jobs started");
}

export function stopJobs() {
  timers.forEach(clearInterval);
  timers.length = 0;
}
