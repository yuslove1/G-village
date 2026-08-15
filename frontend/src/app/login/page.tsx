"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ApiError, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, Field, PageHeading } from "@/components/ui";
import { AuthLayout } from "@/components/auth-layout";
import { postAuthDestination } from "@/lib/utils";
import { GoogleAuthButton, type GoogleSignupPending } from "@/components/google-auth-button";
import { GoogleCompletePhone } from "@/components/google-complete-phone";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useAuth((s) => s.login);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [googlePending, setGooglePending] = useState<GoogleSignupPending | null>(null);

  function onAuthed(user: User) {
    toast.success(`Welcome, ${user.fullName.split(" ")[0]}`);
    router.push(postAuthDestination(user, params.get("next")));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const user = await login(identifier, password);
      toast.success(`Welcome back, ${user.fullName.split(" ")[0]}`);
      router.push(postAuthDestination(user, params.get("next")));
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const next: typeof errors = {};
        for (const f of err.fields) {
          if (f.path === "identifier" || f.path === "password") next[f.path] = f.message;
        }
        setErrors(next);
      }
      toast.error(err instanceof ApiError ? err.message : "Could not log you in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      variant="login"
      toggleLabel="New to Gadgetvillage?"
      toggleCta="Create an account"
      toggleHref="/signup"
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

        <PageHeading className="lg:px-0 lg:pt-10" sub="Log in to buy, sell or track an order">
          Welcome back
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
            label="Phone or email"
            autoComplete="username"
            placeholder="0803 123 4567"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            error={errors.identifier}
            required
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />

          <div className="pt-2">
            <Button type="submit" block size="lg" loading={loading}>
              Log in
            </Button>
          </div>
        </form>
          </>
        )}

        <p className="px-6 pt-6 text-center text-sm text-ink-muted lg:hidden">
          New to Gadgetvillage?{" "}
          <Link href="/signup" className="font-bold text-coral">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

// useSearchParams (for the post-login "next" redirect) opts the whole tree
// into client-side rendering unless it sits under its own Suspense boundary
// — without this, `next build` fails to prerender the page at all.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
