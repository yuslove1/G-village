"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleAlert, ClipboardCheck, PackageSearch, Wallet, ChevronRight } from "lucide-react";
import { api, type AdminAction } from "@/lib/api";
import { Card, PageHeading, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const URGENCY_STYLE: Record<AdminAction["urgency"], string> = {
  urgent: "bg-danger-soft text-danger",
  today: "bg-amber-soft text-amber",
  due: "bg-coral-soft text-coral-dark",
};

const URGENCY_LABEL: Record<AdminAction["urgency"], string> = {
  urgent: "Urgent",
  today: "Today",
  due: "Due",
};

function StatTile({
  label,
  value,
  href,
  icon,
}: {
  label: string;
  value: string | number;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <Card className="border-0 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-soft text-cyan-dark">
          {icon}
        </span>
        <p className="tabular mt-3 text-xl font-bold text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{label}</p>
      </Card>
    </Link>
  );
}

export default function AdminOverviewPage() {
  const query = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api.admin.overview(),
  });

  const data = query.data;

  return (
    <div className="lg:mx-auto lg:max-w-4xl">
      <PageHeading className="pb-0">Overview</PageHeading>

      <div className="px-6 lg:px-12">
        <Card className="border-0 bg-coral-soft p-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-coral-dark">Revenue today</p>
          {query.isLoading ? (
            <Skeleton className="mt-3 h-9 w-40" />
          ) : (
            <>
              <p className="tabular mt-2 font-display text-[2.25rem] leading-none text-ink">
                {data?.today.revenue.display}
              </p>
              <p className="mt-3 text-xs text-ink-muted">{data?.today.orders} order(s) paid today</p>
            </>
          )}
        </Card>

        {query.isLoading ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatTile
              label="To fulfil"
              value={data?.queues.toFulfil ?? 0}
              href="/admin/orders"
              icon={<PackageSearch className="h-4 w-4" aria-hidden />}
            />
            <StatTile
              label="Inspections"
              value={data?.queues.inspections ?? 0}
              href="/admin/inspections"
              icon={<ClipboardCheck className="h-4 w-4" aria-hidden />}
            />
            <StatTile
              label="Payouts due"
              value={data?.queues.pendingPayouts ?? 0}
              href="/admin/payouts"
              icon={<Wallet className="h-4 w-4" aria-hidden />}
            />
          </div>
        )}

        {query.isLoading ? (
          <Skeleton className="mt-4 h-40 w-full" />
        ) : (
          (data?.actions.length ?? 0) > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Needs your action</p>
                <Link href="/admin/orders" className="text-xs font-bold text-coral-dark">
                  View all
                </Link>
              </div>
              <div className="mt-2 space-y-2">
                {data!.actions.map((a, i) => (
                  <Link key={`${a.type}-${i}`} href={a.href} className="block">
                    <Card className="flex items-center gap-3 border-0 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink">{a.label}</p>
                        <p className="truncate text-xs text-ink-muted">{a.detail}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", URGENCY_STYLE[a.urgency])}>
                        {URGENCY_LABEL[a.urgency]}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )
        )}

        {!query.isLoading && data && (
          <Card className="mt-4 flex items-center gap-3 border-0 p-4">
            {data.ledger.balanced ? (
              <CircleCheck className="h-5 w-5 shrink-0 text-mint" aria-hidden />
            ) : (
              <CircleAlert className="h-5 w-5 shrink-0 text-danger" aria-hidden />
            )}
            <p className="text-xs text-ink-muted">
              {data.ledger.balanced ? (
                <span className="font-bold text-ink">Books are balanced.</span>
              ) : (
                <span className="font-bold text-danger">Books are off by {data.ledger.delta} kobo.</span>
              )}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
