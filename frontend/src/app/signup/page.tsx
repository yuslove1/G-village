"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ApiError, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, Field, PageHeading } from "@/components/ui";
import { AuthLayout } from "@/components/auth-layout";
import { postAuthDestination } from "@/lib/utils";
import { GoogleAuthButton, type GoogleSignupPending } from "@/components/google-auth-button";
import { GoogleCompletePhone } from "@/components/google-complete-phone";

type FieldErrors = Partial<Record<"fullName" | "phone" | "email" | "password", string>>;

export default function SignupPage() {
  const router = useRouter();
  const register = useAuth((s) => s.register);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);
  const [googlePending, setGooglePending] = useState<GoogleSignupPending | null>(null);

  function onAuthed(user: User) {
    toast.success(`Welcome to Gadgetvillage, ${user.fullName.split(" ")[0]}`);
    router.push(postAuthDestination(user));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const { user, devOtp } = await register({
        fullName,
        phone,
        email: email || undefined,
        password,
      });
      if (devOtp) {
        // No SMS provider wired up outside production — this is the only
        // way to complete verification locally.
        toast.message("Dev OTP", { description: devOtp, duration: 10_000 });
      }
      toast.success(`Welcome to Gadgetvillage, ${user.fullName.split(" ")[0]}`);
      router.push(postAuthDestination(user));
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const next: FieldErrors = {};
        for (const f of err.fields) {
          if (f.path in ({ fullName: 1, phone: 1, email: 1, password: 1 } as const)) {
            next[f.path as keyof FieldErrors] = f.message;
          }
        }
        setErrors(next);
      }
      toast.error(err instanceof ApiError ? err.message : "Could not create your account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      variant="signup"
      toggleLabel="Already have an account?"
      toggleCta="Log in"
      toggleHref="/login"
    >
      <div className="animate-fade-up">
        <div className="px-6 pt-4 lg:hidden">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
        </div>

        <PageHeading className="lg:px-0 lg:pt-10" sub="Buy, sell or trade in — one account for all of it">
          Create an account
        </PageHeading>

        {googlePending ? (
          <GoogleCompletePhone pending={googlePending} onDone={onAuthed} />
        ) : (
          <>
        <div className="px-6 pb-4 lg:px-0">
          <GoogleAuthButton onSuccess={onAuthed} onNeedsPhone={setGooglePending} />
        </div>

        <div className="flex items-center gap-3 px-6 pb-4 lg:px-0">
          <span className="h-px flex-1 bg-hairline" />
          <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">or</span>
          <span className="h-px flex-1 bg-hairline" />
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 lg:px-0">
          <Field
            label="Full name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            error={errors.fullName}
            required
          />
          <Field
            label="Phone number"
            type="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            hint="We text a one-time code here to confirm it's really you"
            required
          />
          <Field
            label="Email (optional)"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number"
            required
          />

          <div className="pt-2">
            <Button type="submit" block size="lg" loading={loading}>
              Create account
            </Button>
          </div>
        </form>
          </>
        )}

        <p className="px-6 pt-6 text-center text-sm text-ink-muted lg:hidden">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-coral">
            Log in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
