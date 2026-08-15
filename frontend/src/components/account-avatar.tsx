"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { cn, initials } from "@/lib/utils";

/**
 * Shared between the mobile home-page header and TopNav's desktop bar —
 * both spots need the same "signed-in initials, otherwise a login prompt"
 * logic, and auth state only exists on the client, so this is the one
 * client boundary either server-rendered page has to carve out for it.
 */
export function AccountAvatar({ className }: { className?: string }) {
  const user = useAuth((s) => s.user);

  return (
    <Link
      href="/account"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full bg-coral-soft text-xs font-bold text-coral-dark",
        className,
      )}
      aria-label={user ? "Your account" : "Log in"}
    >
      {user ? initials(user.fullName) : <UserRound className="h-4 w-4" aria-hidden />}
    </Link>
  );
}
