import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";
import type { Role } from "@prisma/client";

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

const ISSUER = "gadgetvillage";
const AUDIENCE = "gadgetvillage-api";

export interface AccessClaims {
  sub: string;
  role: Role;
  sid: string; // session id, so a revoked session kills the access token early
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(accessKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessKey, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["HS256"], // pinned. never trust the header's alg claim
  });
  if (!payload.sub || !payload.role || !payload.sid) {
    throw new Error("Token is missing required claims");
  }
  return {
    sub: payload.sub,
    role: payload.role as Role,
    sid: payload.sid as string,
  };
}

const GOOGLE_SIGNUP_AUDIENCE = "gadgetvillage-google-signup";

export interface GoogleSignupClaims {
  email: string;
  fullName: string;
  googleSub: string;
}

/**
 * Bridges the two requests a brand-new Google sign-in takes: this app's
 * identity is phone-first (see auth.routes.ts's phone schema), and Google
 * never hands over a phone number. Rather than weakening User.phone to
 * optional for everyone, a verified Google identity gets 10 minutes to come
 * back with a phone before the claim expires — a distinct audience from
 * access tokens so the two can never be swapped for each other even though
 * they share a signing key.
 */
export async function signGoogleSignupToken(claims: GoogleSignupClaims): Promise<string> {
  return new SignJWT({ email: claims.email, fullName: claims.fullName, googleSub: claims.googleSub })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(GOOGLE_SIGNUP_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(accessKey);
}

export async function verifyGoogleSignupToken(token: string): Promise<GoogleSignupClaims> {
  const { payload } = await jwtVerify(token, accessKey, {
    issuer: ISSUER,
    audience: GOOGLE_SIGNUP_AUDIENCE,
    algorithms: ["HS256"],
  });
  if (!payload.email || !payload.fullName || !payload.googleSub) {
    throw new Error("Token is missing required claims");
  }
  return {
    email: payload.email as string,
    fullName: payload.fullName as string,
    googleSub: payload.googleSub as string,
  };
}

/**
 * Refresh tokens are opaque random strings, not JWTs. There is nothing to gain
 * from making them self-describing, and plenty to lose: an opaque token can be
 * revoked by deleting one row, while a stateless JWT stays valid until it
 * expires no matter what you do.
 */
export const refreshCookieName = "gv_rt";

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax" as const,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL * 1000,
  };
}
