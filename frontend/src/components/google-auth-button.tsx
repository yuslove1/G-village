"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { ApiError, type User } from "@/lib/api";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_ID = "google-identity-script";

export interface GoogleSignupPending {
  signupToken: string;
  fullName: string;
  email: string;
}

/**
 * Renders Google's own "Continue with Google" button once GOOGLE_CLIENT_ID
 * is configured — see backend/src/lib/google.ts and .env.example. Unset, it
 * renders nothing rather than a button that fails every time it's tapped.
 */
export function GoogleAuthButton({
  onSuccess,
  onNeedsPhone,
}: {
  onSuccess: (user: User) => void;
  onNeedsPhone: (pending: GoogleSignupPending) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const loginWithGoogle = useAuth((s) => s.loginWithGoogle);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    async function handleCredential(response: GoogleCredentialResponse) {
      try {
        const result = await loginWithGoogle(response.credential);
        if (result.needsPhone) onNeedsPhone(result);
        else onSuccess(result.user);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not sign in with Google");
      }
    }

    function render() {
      if (cancelled || !window.google || !ref.current) return;
      window.google.accounts.id.initialize({ client_id: CLIENT_ID!, callback: handleCredential });
      window.google.accounts.id.renderButton(ref.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
      });
    }

    if (document.getElementById(SCRIPT_ID)) {
      render();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLIENT_ID) return null;

  return <div ref={ref} className="flex justify-center" />;
}
