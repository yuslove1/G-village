"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingBag } from "lucide-react";
import { AccountAvatar } from "@/components/account-avatar";
import { useAuth } from "@/lib/auth-store";
import { useCart, cartCount } from "@/lib/cart-store";
import { cn } from "@/lib/utils";

const STAFF_DASHBOARD: Partial<Record<string, string>> = { ADMIN: "/admin", AGENT: "/agent" };

const links = [
  { href: "/", label: "Home" },
  { href: "/browse", label: "Browse" },
  { href: "/alerts", label: "Alerts" },
];

// Same rule as BottomNav — a payment or auth screen with an escape hatch
// in the header is a screen people leave.
// /admin and /agent have their own StaffTopBar (see staff-top-bar.tsx) —
// the consumer nav has no business wrapping an internal tool.
const HIDE_ON = ["/checkout", "/login", "/signup", "/verify", "/pay", "/admin", "/agent", "/welcome"];

/**
 * The bottom tab bar is a mobile pattern — pinned to the bottom of a
 * hand-held screen. Stretched across a desktop viewport it just floats,
 * disconnected from the content above it. This replaces it at the lg
 * breakpoint instead of trying to make one component serve both.
 */
export function TopNav() {
  const pathname = usePathname();
  const count = useCart((s) => cartCount(s.items));
  const user = useAuth((s) => s.user);
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  const dashboardHref = user ? STAFF_DASHBOARD[user.role] : undefined;

  return (
    <header className="sticky top-0 z-40 hidden border-b border-hairline bg-canvas/95 backdrop-blur lg:block">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-12">
        <Link href="/" className="font-display text-lg text-ink">
          Gadgetvillage<span className="text-coral">.</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-8">
          {links.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-sm font-semibold transition-colors",
                  active ? "text-coral" : "text-ink-muted hover:text-ink",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {/* Staff who click through to the marketplace (see StaffTopBar)
              land in a nav that has no idea they came from /admin or /agent
              — this is the way back, on the one nav that's already always
              visible regardless of scroll position. */}
          {dashboardHref && (
            <Link
              href={dashboardHref}
              className="flex h-10 items-center gap-1.5 rounded-pill bg-ink px-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
              Dashboard
            </Link>
          )}
          <Link
            href="/sell"
            className="flex h-10 items-center rounded-pill bg-coral px-5 text-sm font-semibold text-white shadow-button transition-transform active:scale-[0.98]"
          >
            Sell a gadget
          </Link>
          <Link
            href="/cart"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-muted"
            aria-label={`Cart${count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ""}`}
          >
            <ShoppingBag className="h-[18px] w-[18px]" aria-hidden />
            {count > 0 && (
              <span className="tabular absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>
          <AccountAvatar className="h-10 w-10" />
        </div>
      </div>
    </header>
  );
}
