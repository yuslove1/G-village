import "dotenv/config";
import { z } from "zod";

// The app refuses to boot on a bad environment. A server that starts with a
// missing JWT secret is worse than one that never starts, because the first
// one will happily issue tokens nobody can trust.

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, "access secret must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "refresh secret must be at least 32 chars"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  PAYSTACK_SECRET_KEY: z.string().min(1),
  PAYSTACK_PUBLIC_KEY: z.string().min(1),

  CORS_ORIGINS: z.string().default(""),
  ORDER_RESERVATION_MINUTES: z.coerce.number().int().positive().default(30),

  // Optional on purpose — unset, uploaded photos fall back to local disk
  // (see lib/storage.ts). Paste the connection string from the Cloudinary
  // dashboard (cloudinary://<key>:<secret>@<cloud_name>) and restart the
  // server; nothing else changes.
  CLOUDINARY_URL: z.string().optional(),

  // Optional — unset, alert-match emails just log instead of sending (see
  // lib/email.ts), same pattern as OTP codes before an SMS provider exists.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default("alerts@gadgetvillage.ng"),

  // Optional — unset, "Continue with Google" fails cleanly with a clear error
  // instead of the button not existing. Get these from the Google Cloud
  // Console (APIs & Services → Credentials → OAuth client ID, type "Web
  // application"), authorized JavaScript origin = APP_URL.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Environment is not valid:\n${issues}`);
  process.exit(1);
}

const raw = parsed.data;

if (raw.NODE_ENV === "production") {
  if (raw.JWT_ACCESS_SECRET === raw.JWT_REFRESH_SECRET) {
    console.error("Access and refresh secrets must differ in production.");
    process.exit(1);
  }
  if (raw.PAYSTACK_SECRET_KEY.startsWith("sk_test")) {
    console.error("Refusing to boot production with a Paystack test key.");
    process.exit(1);
  }
}

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === "production",
  isDev: raw.NODE_ENV === "development",
  corsOrigins: raw.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};

export type Env = typeof env;
