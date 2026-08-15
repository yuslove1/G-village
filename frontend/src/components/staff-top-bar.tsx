"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Store } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import { initials } from "@/lib/utils";

/**
 * Replaces the consumer TopNav/BottomNav inside /admin and /agent — those
 * are hidden on staff routes (see HIDE_ON in top-nav.tsx/bottom-nav.tsx)
 * because a marketplace tab bar has no business wrapping an internal tool.
 * This is the one place staff get back to logging out or checking the
 * consumer site, since BottomNav's Account tab isn't there to do it.
 */
export function StaffTopBar({ label }: { label: string }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    toast.success("Logged out");
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-base text-ink">
            Gadgetvillage<span className="text-coral">.</span>
          </span>
          <span className="rounded-pill bg-ink px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {label}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/"
            aria-label="Marketplace"
            className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-ink"
          >
            <Store className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Marketplace</span>
          </Link>
          {user && (
            <Link
              href="/account"
              aria-label={`${user.fullName}'s profile`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral-soft text-xs font-bold text-coral-dark transition-transform active:scale-95"
            >
              {initials(user.fullName)}
            </Link>
          )}
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-ink-muted hover:text-danger"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
