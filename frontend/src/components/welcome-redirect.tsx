"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { hasSeenWelcome } from "@/lib/onboarding";

/**
 * First-run marketing splash, shown once per device before the functional
 * home page. Gated on "guest" specifically (not "idle"/"loading") so a
 * returning logged-in user's silent-refresh window never flashes the splash
 * before bouncing them back — see StaffHomeRedirect for the same guard on
 * the same root path. The ref keeps this to one redirect per session; it
 * only exists to skip the splash, never to force it, so there is nothing to
 * re-arm on logout the way StaffHomeRedirect re-arms its own redirect.
 */
export function WelcomeRedirect() {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const checked = useRef(false);

  useEffect(() => {
    if (status !== "guest" || pathname !== "/" || checked.current) return;
    checked.current = true;
    if (!hasSeenWelcome()) router.replace("/welcome");
  }, [status, pathname, router]);

  return null;
}
