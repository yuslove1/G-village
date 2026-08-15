"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/stock", label: "Stock" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/inspections", label: "Inspections" },
  { href: "/admin/checklist", label: "Checklist" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/payouts", label: "Payouts" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex gap-2 overflow-x-auto px-6 pb-5 pt-4 lg:px-12">
      {LINKS.map(({ href, label }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
              active ? "bg-coral text-white" : "bg-surface text-ink-muted",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
