"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { ApiError, type User } from "@/lib/api";
import { Button, Field } from "@/components/ui";
import type { GoogleSignupPending } from "@/components/google-auth-button";

/**
 * The second step of a first-time Google sign-in — Google never hands over a
 * phone number, and this app's identity model is phone-first (order and
 * pickup updates, the login "phone or email" field), so a brand-new Google
 * identity is one phone number away from being a real account.
 */
export function GoogleCompletePhone({
  pending,
  onDone,
}: {
  pending: GoogleSignupPending;
  onDone: (user: User) => void;
}) {
  const completeGoogleSignup = useAuth((s) => s.completeGoogleSignup);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { user, devOtp } = await completeGoogleSignup(pending.signupToken, phone);
      if (devOtp) {
        toast.message("Dev OTP", { description: devOtp, duration: 10_000 });
      }
      onDone(user);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not finish creating your account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 px-6 lg:px-0">
      <p className="text-sm text-ink-muted">
        Signed in as <span className="font-bold text-ink">{pending.fullName}</span> ({pending.email}). One more
        thing — we need a phone number for order and pickup updates.
      </p>
      <Field
        label="Phone number"
        type="tel"
        autoComplete="tel"
        placeholder="0803 123 4567"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        hint="We text a one-time code here to confirm it's really you"
        required
      />
      <Button type="submit" block size="lg" loading={loading}>
        Finish creating account
      </Button>
    </form>
  );
}
