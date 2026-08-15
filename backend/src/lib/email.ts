import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Same optional-provider shape as lib/storage.ts's Cloudinary switch: unset
 * RESEND_API_KEY and this logs instead of sending, so nothing crashes in dev
 * or in an environment nobody has configured a mail provider for yet.
 */
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

if (resend) {
  logger.info("email: Resend");
} else {
  logger.info("email: not configured (set RESEND_API_KEY to send for real)");
}

export async function sendEmail(args: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!resend) {
    logger.debug({ to: args.to, subject: args.subject }, "email not sent (no RESEND_API_KEY)");
    return false;
  }

  try {
    await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to: args.to }, "failed to send email");
    return false;
  }
}
