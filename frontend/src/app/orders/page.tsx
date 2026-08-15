"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { cn, formatDate, ORDER_STATUS_LABEL } from "@/lib/utils";

const TABS = ["All", "Active", "Completed"] as const;
const COMPLETED = new Set(["DELIVERED"]);
const INACTIVE = new Set(["CANCELLED", "REFUNDED"]);

export default function OrderHistoryPage() {
  const { status } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");

  const query = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
    enabled: status === "authenticated",
  });

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<PackageSearch className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to see your order history."
        action={
          <Button asChild>
            <Link href="/login?next=/orders">Log in</Link>
          </Button>
        }
      />
    );
  }

  const orders = query.data?.orders ?? [];
  const filtered = orders.filter((o) => {
    if (tab === "All") return true;
    if (tab === "Completed") return COMPLETED.has(o.status);
    return !COMPLETED.has(o.status) && !INACTIVE.has(o.status);
  });

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <PageHeading>Orders</PageHeading>

      <div className="flex gap-2 px-6" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-pill px-4 py-2 text-sm font-semibold transition-colors",
              tab === t ? "bg-coral text-white" : "bg-surface text-ink-muted",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="space-y-3 px-6 pt-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PackageSearch className="h-9 w-9" />}
          title="No orders here"
          description="Nothing in this tab yet."
        />
      ) : (
        <ul className="space-y-3 px-6 pt-5">
          {filtered.map((o) => (
            <li key={o.reference} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-faint">#{o.reference}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-ink">{o.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{formatDate(o.createdAt)}</p>
                </div>
                <span className="tabular shrink-0 text-sm font-bold text-ink">{o.total.display}</span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                <span className="text-xs font-semibold text-coral">
                  {ORDER_STATUS_LABEL[o.status] ?? o.status}
                </span>
                <div className="flex gap-4">
                  <Link href={`/orders/${o.reference}/receipt`} className="text-xs font-semibold text-ink-muted">
                    Receipt
                  </Link>
                  <Link href={`/orders/${o.reference}`} className="text-xs font-semibold text-ink-muted">
                    Track
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
