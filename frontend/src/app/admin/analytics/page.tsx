"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { Card, PageHeading, Skeleton } from "@/components/ui";
import { RevenueLineChart } from "@/components/charts/revenue-line-chart";
import { BarList } from "@/components/charts/bar-list";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: 7, label: "7 days" },
  { key: 30, label: "30 days" },
  { key: 3650, label: "All" },
] as const;

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]["key"]>(30);

  const query = useQuery({
    queryKey: ["admin", "analytics", days],
    queryFn: () => api.admin.analytics(days),
  });

  const data = query.data;

  return (
    <div className="lg:mx-auto lg:max-w-4xl">
      <PageHeading className="pb-0">Analytics</PageHeading>

      <div className="flex gap-2 px-6 lg:px-12" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={days === p.key}
            onClick={() => setDays(p.key)}
            className={cn(
              "rounded-pill px-4 py-2 text-sm font-semibold",
              days === p.key ? "bg-ink text-white" : "bg-surface text-ink-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="px-6 pt-5 lg:px-12">
        <Card className="border-0 bg-coral-soft p-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-coral-dark">
            Revenue · {PERIODS.find((p) => p.key === days)?.label}
          </p>
          {query.isLoading ? (
            <Skeleton className="mt-3 h-9 w-40" />
          ) : (
            <>
              <p className="tabular mt-2 font-display text-[2.25rem] leading-none text-ink">
                {data?.revenue.display}
              </p>
              {data?.growthPercent != null && (
                <p
                  className={cn(
                    "mt-3 flex items-center gap-1 text-xs font-semibold",
                    data.growthPercent >= 0 ? "text-mint" : "text-danger",
                  )}
                >
                  {data.growthPercent >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {Math.abs(data.growthPercent).toFixed(1)}% vs previous period
                </p>
              )}
            </>
          )}
        </Card>

        {!query.isLoading && data && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Card className="border-0 p-4">
              <p className="tabular text-lg font-bold text-ink">{data.margin.display}</p>
              <p className="mt-0.5 text-xs text-ink-muted">Total margin</p>
            </Card>
            <Card className="border-0 p-4">
              <p className="tabular text-lg font-bold text-ink">{data.marginPercent}%</p>
              <p className="mt-0.5 text-xs text-ink-muted">Avg margin</p>
            </Card>
            <Card className="border-0 p-4">
              <p className="tabular text-lg font-bold text-ink">{data.avgOrder.display}</p>
              <p className="mt-0.5 text-xs text-ink-muted">Avg order</p>
            </Card>
          </div>
        )}

        <div className="mt-6">
          <h2 className="text-sm font-bold text-ink">Revenue over time</h2>
          {query.isLoading ? (
            <Skeleton className="mt-3 h-[220px] w-full" />
          ) : (
            <Card className="mt-3 border-0 p-4">
              <RevenueLineChart data={data?.revenueSeries ?? []} />
            </Card>
          )}
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-bold text-ink">Top sellers</h2>
          {query.isLoading ? (
            <Skeleton className="mt-3 h-32 w-full" />
          ) : (
            <Card className="mt-3 border-0 p-4">
              <BarList
                items={(data?.topSellers ?? []).map((s) => ({
                  label: s.model,
                  value: s.unitsSold,
                  valueLabel: `${s.unitsSold} sold`,
                  sublabel: `${s.margin.display} margin`,
                }))}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
