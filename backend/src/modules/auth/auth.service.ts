import { Role } from "@prisma/client";
import { addSeconds, addMinutes } from "date-fns";
import { nanoid } from "nanoid";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { env } from "../../config/env.js";
import { badRequest, conflict, tooMany, unauthorized } from "../../lib/errors.js";
import {
  generateOtp,
  hashPassword,
  hashToken,
  randomToken,
  verifyPassword,
} from "../../lib/crypto.js";
import { signAccessToken } from "../../lib/tokens.js";

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

interface SessionContext {
  userAgent?: string;
  ip?: string;
}

async function issueSession(userId: string, role: Role, ctx: SessionContext, family?: string) {
  const refreshToken = randomToken();
  const session = await prisma.session.create({
    data: {
      userId,
      refreshHash: hashToken(refreshToken),
      family: family ?? nanoid(16),
      userAgent: ctx.userAgent?.slice(0, 255),
      ip: ctx.ip,
      expiresAt: addSeconds(new Date(), env.REFRESH_TOKEN_TTL),
    },
  });

  const accessToken = await signAccessToken({ sub: userId, role, sid: session.id });
  return { accessToken, refreshToken, sessionId: session.id, family: session.family };
}

export async function register(input: {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  ctx: SessionContext;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone: input.phone }, ...(input.email ? [{ email: input.email }] : [])] },
    select: { id: true },
  });

  // Deliberately vague. Telling the caller which field collided turns signup
  // into a way to test whether a phone number has an account here.
  if (existing) throw conflict("An account with those details already exists");

  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email ?? null,
      passwordHash: await hashPassword(input.password),
      role: Role.BUYER,
    },
  });

  const otp = await createOtp(user.id, "phone_verify");
  const tokens = await issueSession(user.id, user.role, input.ctx);

  return { user: publicUser(user), ...tokens, devOtp: env.isProd ? undefined : otp };
}

export async function login(input: { identifier: string; password: string; ctx: SessionContext }) {
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone: input.identifier }, { email: input.identifier.toLowerCase() }],
    },
  });

  // Same error whether the account is missing or the password is wrong, and
  // the hash still runs on a miss so the response time does not give it away.
  const genericFailure = unauthorized("Those details do not match an account");

  if (!user) {
    await verifyPassword(
      "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000",
      input.password,
    );
    throw genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw tooMany("Too many failed attempts. Try again in a few minutes.");
  }

  const ok = await verifyPassword(user.passwordHash, input.password);

  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? addMinutes(new Date(), LOCKOUT_MINUTES) : null,
      },
    });
    throw genericFailure;
  }

  if (user.failedLoginCount > 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  const tokens = await issueSession(user.id, user.role, input.ctx);
  return { user: publicUser(user), ...tokens };
}

/**
 * Rotation with reuse detection.
 *
 * Every refresh burns the old token and issues a new one in the same family.
 * If a token that was already rotated shows up again, either it leaked or
 * somebody is replaying it. Either way the honest move is to kill the whole
 * family, which signs out the attacker and the real user together. Annoying
 * for one login, much better than the alternative.
 */
export async function refresh(refreshToken: string, ctx: SessionContext) {
  const hash = hashToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshHash: hash },
    include: { user: true },
  });

  if (!session) throw unauthorized("Sign in again to continue");

  if (session.revokedAt) {
    logger.warn({ family: session.family, userId: session.userId }, "refresh token reuse detected");
    await prisma.session.updateMany({
      where: { family: session.family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized("Sign in again to continue");
  }

  if (session.expiresAt < new Date()) throw unauthorized("Sign in again to continue");

  const next = await issueSession(session.userId, session.user.role, ctx, session.family);

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), replacedById: next.sessionId },
  });

  return { user: publicUser(session.user), ...next };
}

export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  await prisma.session
    .updateMany({
      where: { refreshHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}

export async function logoutEverywhere(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function createOtp(userId: string, purpose: string) {
  const code = generateOtp();
  await prisma.otpChallenge.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.otpChallenge.create({
    data: {
      userId,
      purpose,
      codeHash: hashToken(code),
      expiresAt: addMinutes(new Date(), OTP_TTL_MINUTES),
    },
  });
  // Wire an SMS provider here. Logging the code in development is fine, in
  // production this must never be written anywhere.
  if (!env.isProd) logger.debug({ userId, code }, "otp issued");
  return code;
}

export async function requestPhaseOtp(userId: string, purpose = "phone_verify") {
  return createOtp(userId, purpose);
}

export async function verifyOtp(userId: string, code: string, purpose = "phone_verify") {
  const challenge = await prisma.otpChallenge.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) throw badRequest("Request a new code");
  if (challenge.expiresAt < new Date()) throw badRequest("That code expired. Request a new one.");
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw tooMany("Too many wrong codes. Request a new one.");
  }

  if (challenge.codeHash !== hashToken(code)) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw badRequest("That code is not right");
  }

  await prisma.$transaction([
    prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: purpose === "phone_verify" ? { phoneVerifiedAt: new Date() } : {},
    }),
  ]);

  return true;
}

export function publicUser(user: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: Role;
  phoneVerifiedAt: Date | null;
  city: string | null;
  state: string | null;
}) {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    role: user.role,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    city: user.city,
    state: user.state,
  };
}
