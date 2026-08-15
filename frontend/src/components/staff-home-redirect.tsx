"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";

const STAFF_HOME: Partial<Record<string, string>> = { ADMIN: "/admin", AGENT: "/agent" };

/**
 * Staff accounts land in their own tool, not the marketplace — this fires
 * once per session on the root path, so a bookmark or a typed "/" sends an
 * admin/agent straight to /admin or /agent instead of showing them the
 * buyer-facing home page.
 *
 * "Once" matters: this component never unmounts (it lives in the root
 * layout), so without the ref it would fire on every single navigation
 * back to "/" — including a staff user deliberately clicking the
 * "Marketplace" link in StaffTopBar, which would land on "/" and get
 * bounced straight back before they ever saw it. The ref re-arms on
 * logout so the next login still gets the one-time redirect.
 */
export function StaffHomeRedirect() {
  const { user, status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const redirected = useRef(false);

  useEffect(() => {
    if (status === "guest") {
      redirected.current = false;
      return;
    }
    if (status !== "authenticated" || !user || pathname !== "/" || redirected.current) return;
    const dest = STAFF_HOME[user.role];
    if (dest) {
      redirected.current = true;
      router.replace(dest);
    }
  }, [status, user, pathname, router]);

  return null;
}
