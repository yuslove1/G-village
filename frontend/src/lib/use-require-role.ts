"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import type { User } from "@/lib/api";

/**
 * Gate for the agent and admin panels. Both are internal tools, not screens
 * a BUYER/SELLER account should ever land on — silently redirecting home is
 * the right failure mode here, not an "access denied" page that just tells
 * a curious buyer the panel exists.
 */
export function useRequireRole(...roles: Array<User["role"]>) {
  const router = useRouter();
  const { user, status } = useAuth();

  useEffect(() => {
    if (status === "guest") router.replace("/login");
    else if (status === "authenticated" && user && !roles.includes(user.role)) router.replace("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roles is a fixed call-site tuple
  }, [status, user, router]);

  const allowed = status === "authenticated" && Boolean(user) && roles.includes(user!.role);
  const checking = status === "idle" || status === "loading" || (status === "authenticated" && !allowed);

  return { checking, allowed };
}
