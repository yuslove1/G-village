import argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Argon2id, not bcrypt. Bcrypt silently truncates past 72 bytes and its work
 * factor is tuned for hardware that stopped being relevant a while ago.
 * These parameters land around 60ms on a small cloud box, which is slow enough
 * to hurt an attacker and fast enough that nobody notices logging in.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB, the OWASP floor
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed hash in the database should read as "wrong password" to the
    // caller, not as a 500 that tells an attacker something interesting.
    return false;
  }
}

/** Opaque secret for refresh tokens and OTP salting. */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Refresh tokens are stored as SHA-256, not argon2. They are already high
 * entropy random strings, so the slow hash buys nothing and would add latency
 * to every token refresh. What matters is that a leaked database row cannot be
 * replayed as a bearer credential.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant time compare for anything an attacker can submit repeatedly. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so length does not leak through timing.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Six digit numeric OTP. Uses the CSPRNG, never Math.random. */
export function generateOtp(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
