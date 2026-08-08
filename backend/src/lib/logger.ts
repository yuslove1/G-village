import pino from "pino";
import { env } from "../config/env.js";

/**
 * Redaction list is not optional. Logs get shipped to third party services,
 * read by whoever is on call, and kept for months. Nothing here should ever
 * contain a token, a password, or a card number.
 */
export const logger = pino({
  level: env.isProd ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-paystack-signature']",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.otp",
      "req.body.code",
      "req.body.accountNumber",
      "res.headers['set-cookie']",
      "*.passwordHash",
      "*.refreshHash",
      "*.codeHash",
    ],
    censor: "[redacted]",
  },
  transport: env.isProd ? undefined : { target: "pino-pretty", options: { colorize: true } },
});
