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
