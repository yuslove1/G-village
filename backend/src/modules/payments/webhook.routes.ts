import { Router, raw } from "express";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { verifyWebhookSignature } from "../../lib/paystack.js";
import { settlePayment } from "./payment.service.js";

export const webhookRouter = Router();

/**
 * Paystack webhook receiver.
 *
 * Order of operations matters and is not negotiable:
 *   1. read the raw bytes, unparsed
 *   2. verify the signature
 *   3. record the event, which dedupes via a unique index
 *   4. answer 200 immediately
 *   5. do the actual work afterwards
 *
 * Step four before step five is what stops Paystack retrying because we were
 * busy writing to the database. Their live schedule retries every three
 * minutes for the first four attempts, then hourly for three days, so a slow
 * handler turns one event into dozens.
 */
webhookRouter.post(
  "/paystack",
  raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const rawBody = req.body as Buffer;
    const signature = req.header("x-paystack-signature");

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn({ ip: req.ip }, "rejected webhook with bad signature");
      return res.status(401).json({ error: { code: "bad_signature" } });
    }

    let event: { event: string; data: Record<string, unknown> };
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return res.status(400).json({ error: { code: "bad_payload" } });
    }

    // Paystack does not send an event id, so build a stable key from the event
    // type plus the transaction reference. Same event twice, same key, and the
    // unique index does the deduping for us.
    const reference = String(event.data?.reference ?? event.data?.id ?? "");
    const idempotencyKey = `${event.event}:${reference}`;

    if (!reference) {
      logger.warn({ event: event.event }, "webhook had no reference");
      return res.status(200).json({ received: true });
    }

    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "paystack",
          idempotencyKey,
          eventType: event.event,
          payload: event as never,
        },
      });
    } catch {
      // Unique violation. Already seen this one, nothing to do.
      logger.debug({ idempotencyKey }, "duplicate webhook ignored");
      return res.status(200).json({ received: true, duplicate: true });
    }

    res.status(200).json({ received: true });

    // Work happens after the response is out the door.
    void processEvent(idempotencyKey, event.event, reference);
  },
);

async function processEvent(idempotencyKey: string, eventType: string, reference: string) {
  try {
    if (eventType === "charge.success") {
      await settlePayment(reference);
    }

    await prisma.webhookEvent.updateMany({
      where: { provider: "paystack", idempotencyKey },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, idempotencyKey }, "webhook processing failed");

    // Left with processedAt null on purpose. A sweeper picks these up and
    // retries, so a transient database blip does not swallow a payment.
    await prisma.webhookEvent
      .updateMany({
        where: { provider: "paystack", idempotencyKey },
        data: { error: message },
      })
      .catch(() => undefined);
  }
}

/** Retries anything the first pass could not finish. Runs on a timer. */
export async function replayFailedWebhooks(limit = 20) {
  const pending = await prisma.webhookEvent.findMany({
    where: { processedAt: null, provider: "paystack" },
    orderBy: { receivedAt: "asc" },
    take: limit,
  });

  let recovered = 0;
  for (const evt of pending) {
    const payload = evt.payload as { data?: { reference?: string } };
    const reference = payload?.data?.reference;
    if (!reference) continue;

    try {
      if (evt.eventType === "charge.success") await settlePayment(reference);
      await prisma.webhookEvent.update({
        where: { id: evt.id },
        data: { processedAt: new Date(), error: null },
      });
      recovered++;
    } catch (err) {
      logger.error({ err, id: evt.id }, "webhook replay failed again");
    }
  }
  return recovered;
}
