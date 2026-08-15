"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Grid2x2, House, LayoutDashboard, Plus, User } from "lucide-react";
import { useAuth } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: House },
  { href: "/browse", label: "Browse", icon: Grid2x2 },
  { href: "/sell", label: "Sell", icon: Plus, center: true },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/account", label: "Account", icon: User },
];

const STAFF_DASHBOARD: Partial<Record<string, string>> = { ADMIN: "/admin", AGENT: "/agent" };

// Hidden on checkout and auth. A payment page with an escape hatch in the
// corner is a payment page people leave.
// /admin and /agent have their own StaffTopBar (see staff-top-bar.tsx) —
// the consumer nav has no business wrapping an internal tool.
const HIDE_ON = ["/checkout", "/login", "/signup", "/verify", "/pay", "/admin", "/agent", "/welcome"];

export function BottomNav() {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  // This tab bar is fixed and always on screen, unlike TopNav's desktop-only
  // sticky header — for a staff account it's the one place on the whole
  // consumer site guaranteed reachable at any scroll depth, so it's what
  // carries the way back to /admin or /agent on mobile (see TopNav for the
  // desktop equivalent). "Sell" is the least useful FAB action for someone
  // who is on the marketplace to check on it, not to sell a device.
  const dashboardHref = user ? STAFF_DASHBOARD[user.role] : undefined;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch rounded-[28px] bg-canvas px-2 shadow-soft">
        {items.map(({ href, label, icon: Icon, center }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          if (center) {
            return (
              <li key={href} className="flex flex-1 items-center justify-center">
                <Link
                  href={dashboardHref ?? href}
                  className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-coral text-white shadow-button transition-transform active:scale-95"
                  aria-label={dashboardHref ? "Your dashboard" : "Sell a gadget"}
                >
                  {dashboardHref ? (
                    <LayoutDashboard className="h-5 w-5" aria-hidden />
                  ) : (
                    <Icon className="h-5 w-5" aria-hidden />
                  )}
                </Link>
              </li>
            );
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-3.5 text-[10px] transition-colors"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    active ? "bg-coral-soft text-coral-dark" : "text-ink-faint",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className={active ? "font-bold text-ink" : "text-ink-faint"}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
