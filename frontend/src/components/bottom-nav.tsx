"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Grid2x2, House, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Home", icon: House },
  { href: "/browse", label: "Browse", icon: Grid2x2 },
  { href: "/sell", label: "Sell", icon: Plus, center: true },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/account", label: "Account", icon: User },
];

// Hidden on checkout and auth. A payment page with an escape hatch in the
// corner is a payment page people leave.
const HIDE_ON = ["/checkout", "/login", "/signup", "/verify", "/pay"];

export function BottomNav() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch">
        {items.map(({ href, label, icon: Icon, center }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          if (center) {
            return (
              <li key={href} className="flex flex-1 items-center justify-center">
                <Link
                  href={href}
                  className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white transition-transform active:scale-95"
                  aria-label="Sell a gadget"
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </Link>
              </li>
            );
          }

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-[10px] transition-colors",
                  active ? "text-ink" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
                <span
                  className={cn("h-1 w-1 rounded-full", active ? "bg-teal" : "bg-transparent")}
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
