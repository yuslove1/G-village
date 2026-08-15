import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

// Same optional-provider shape as email.ts and storage.ts — unset
// GOOGLE_CLIENT_ID and the button on the frontend still renders, but the
// backend call it makes fails with a clear message instead of a crash.
const client = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  fullName: string;
  googleSub: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (!client || !env.GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured on this server yet");
  }

  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new Error("Google did not return a usable identity");
  }

  return {
    email: payload.email.toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    fullName: payload.name ?? payload.email,
    googleSub: payload.sub,
  };
}
