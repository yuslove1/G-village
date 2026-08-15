"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, Field, PageHeading, Skeleton } from "@/components/ui";
import { postAuthDestination } from "@/lib/utils";

const RESEND_COOLDOWN = 60;

export default function VerifyPage() {
  const router = useRouter();
  const { user, status, setUser } = useAuth();

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentOnce = useRef(false);

  // requireAuth on both OTP endpoints means this screen only makes sense
  // signed in with a phone still unverified — anything else redirects
  // straight past it instead of showing a dead form.
  useEffect(() => {
    if (status === "guest") router.replace("/login?next=/verify");
    else if (status === "authenticated" && user?.phoneVerified) router.replace(postAuthDestination(user));
  }, [status, user, router]);

  async function sendCode() {
    setSending(true);
    try {
      await api.auth.sendOtp();
      toast.success("Code sent by SMS");
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send a code right now");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated" || user?.phoneVerified || sentOnce.current) return;
    sentOnce.current = true;
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    try {
      await api.auth.verifyOtp(code);
      const verifiedUser = user ? { ...user, phoneVerified: true } : null;
      if (verifiedUser) setUser(verifiedUser);
      toast.success("Phone verified");
      router.push(verifiedUser ? postAuthDestination(verifiedUser) : "/account");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That code did not match");
    } finally {
      setVerifying(false);
    }
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6 lg:mx-auto lg:max-w-md">
        <Skeleton className="h-7 w-1/2" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-md">
      <div className="flex justify-center px-6 pt-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-coral-soft text-coral-dark">
          <ShieldCheck className="h-7 w-7" aria-hidden />
        </span>
      </div>

      <PageHeading
        className="text-center"
        sub={user ? `Enter the 6-digit code sent to ${user.phone}` : undefined}
      >
        Verify your phone
      </PageHeading>

      <form onSubmit={onSubmit} className="space-y-4 px-6">
        <Field
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="tabular tracking-[0.4em]"
          required
        />

        <Button type="submit" block size="lg" loading={verifying} disabled={code.length !== 6}>
          Verify
        </Button>
      </form>

      <div className="px-6 pt-4 text-center">
        <button
          type="button"
          onClick={sendCode}
          disabled={sending || cooldown > 0}
          className="text-sm font-semibold text-coral disabled:text-ink-faint"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : sending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </div>
  );
}
