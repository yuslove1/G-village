import { prisma } from "../../lib/prisma.js";
import { sendEmail } from "../../lib/email.js";
import { formatNaira } from "../../lib/money.js";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

/**
 * Fires when a listing goes LIVE — the one moment an alert is actually
 * "news." Called from the three places a listing can start being LIVE
 * (admin.routes.ts: publish on create, publish via status PATCH, and
 * inspection approval). Never awaited by the caller — an email provider
 * being slow must not hold up an admin action.
 */
export async function notifyMatchingAlerts(listingId: string): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { product: true },
  });
  if (!listing) return;

  const alerts = await prisma.alert.findMany({
    where: { isActive: true, viaEmail: true },
    include: { user: { select: { email: true, notifyPriceAlerts: true } } },
  });
  if (alerts.length === 0) return;

  const title = [listing.product.brand, listing.product.model, listing.product.variant]
    .filter(Boolean)
    .join(" ");
  const haystack = `${listing.product.brand} ${listing.product.model}`.toLowerCase();

  for (const alert of alerts) {
    if (!alert.user.email || !alert.user.notifyPriceAlerts) continue;
    if (alert.productId && alert.productId !== listing.productId) continue;
    if (!alert.productId && alert.query && !haystack.includes(alert.query.toLowerCase())) continue;
    if (alert.tiers.length > 0 && !alert.tiers.includes(listing.tier)) continue;
    if (alert.maxKobo != null && listing.priceKobo > alert.maxKobo) continue;

    const sent = await sendEmail({
      to: alert.user.email,
      subject: `${title} just showed up — ${formatNaira(listing.priceKobo)}`,
      html: `
        <p>${title} is now live for ${formatNaira(listing.priceKobo)}.</p>
        <p><a href="${env.APP_URL}/listing/${listing.reference}">View it on Gadgetvillage</a></p>
      `,
    }).catch((err) => {
      logger.error({ err, alertId: alert.id }, "alert email failed");
      return false;
    });

    if (sent) {
      await prisma.alert.update({ where: { id: alert.id }, data: { lastFiredAt: new Date() } });
    }
  }
}
