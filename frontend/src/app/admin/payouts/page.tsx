"use client";

import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { initials } from "@/lib/utils";

export default function AdminPayoutsPage() {
  const query = useQuery({
    queryKey: ["admin", "payouts"],
    queryFn: () => api.admin.payouts(),
  });

  const sellers = query.data?.sellers ?? [];

  return (
    <div className="lg:mx-auto lg:max-w-2xl">
      <PageHeading className="pb-0">Payouts due</PageHeading>

      {!query.isLoading && sellers.length > 0 && (
        <p className="px-6 text-xs text-ink-muted lg:px-12">
          {sellers.length} seller{sellers.length === 1 ? "" : "s"} owed money. The seller withdraws it themselves
          from their own account — this is visibility only.
        </p>
      )}

      {query.isLoading ? (
        <div className="space-y-3 px-6 pt-4 lg:px-12">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : sellers.length === 0 ? (
        <div className="px-6 lg:px-12">
          <EmptyState icon={<Wallet className="h-9 w-9" />} title="Nothing owed" description="Every approved direct sale has been paid out." />
        </div>
      ) : (
        <ul className="space-y-3 px-6 pt-4 lg:px-12">
          {sellers.map((s) => (
            <li key={s.userId} className="flex items-center gap-3 rounded-card bg-canvas p-4 shadow-soft">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-coral-soft text-sm font-bold text-coral-dark">
                {initials(s.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{s.name}</p>
                <p className="text-xs text-ink-muted">
                  {s.phone}
                  {!s.hasPayoutAccount && " · no payout account yet"}
                </p>
              </div>
              <p className="tabular shrink-0 text-sm font-bold text-ink">{s.balance.display}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
