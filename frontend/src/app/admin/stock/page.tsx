"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type AdminListing } from "@/lib/api";
import { Badge, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { cn, TIER_LABEL } from "@/lib/utils";

// A listing already sold or already withdrawn has nothing left to withdraw.
const WITHDRAWABLE = new Set(["DRAFT", "PENDING_INSPECTION", "LIVE", "RESERVED"]);

const TABS = [
  { key: "live", label: "Listed" },
  { key: "low", label: "Low stock" },
  { key: "draft", label: "Draft" },
] as const;

export default function AdminStockPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("live");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const query = useQuery({
    queryKey: ["admin", "listings", tab, debounced],
    queryFn: () => api.admin.listings({ status: tab, q: debounced || undefined }),
  });

  const listings = query.data?.listings ?? [];

  async function withdraw(l: AdminListing) {
    try {
      await api.admin.updateListing(l.reference, { status: "WITHDRAWN" });
      queryClient.setQueryData<{ listings: AdminListing[] } | undefined>(
        ["admin", "listings", tab, debounced],
        (data) => data && { listings: data.listings.filter((x) => x.reference !== l.reference) },
      );
      toast.success(`${l.title} withdrawn`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not withdraw that listing");
    }
  }

  return (
    <div className="lg:mx-auto lg:max-w-4xl">
      <div className="flex items-start justify-between gap-3 px-6 pb-0 pt-2 lg:px-12">
        <PageHeading className="px-0">Stock</PageHeading>
        <Link
          href="/admin/stock/new"
          className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white shadow-button"
          aria-label="Add listing"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      <div className="px-6 lg:px-12">
        <div className="flex h-12 items-center gap-3 rounded-pill border border-transparent bg-surface px-4 transition-colors focus-within:border-coral">
          <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stock"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </div>

        <div className="mt-4 flex gap-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-pill px-4 py-2 text-sm font-semibold",
                tab === t.key ? "bg-ink text-white" : "bg-surface text-ink-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3 px-6 pt-5 lg:px-12">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : listings.length === 0 ? (
        <div className="px-6 lg:px-12">
          <EmptyState title="Nothing here" description="No listings match this filter." />
        </div>
      ) : (
        <>
          {/* Cards on mobile — a real <table> at this width just becomes a
              row of clipped columns. Same data, table below, at lg:. */}
          <ul className="space-y-2.5 px-6 pt-5 lg:hidden">
            {listings.map((l) => (
              <li key={l.reference} className="flex items-center justify-between gap-3 rounded-card bg-canvas p-4 shadow-soft">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{l.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {TIER_LABEL[l.tier] ?? l.tier} · {l.vendor}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {l.stockCount > 0 ? `${l.stockCount} in stock` : "Out of stock"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <p className="tabular text-sm font-bold text-ink">{l.price.display}</p>
                    {l.status === "DRAFT" && (
                      <Badge tone="amber" className="mt-1">
                        Draft
                      </Badge>
                    )}
                  </div>
                  {WITHDRAWABLE.has(l.status) && (
                    <button
                      type="button"
                      onClick={() => withdraw(l)}
                      aria-label={`Withdraw ${l.title}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden px-12 pt-5 lg:block">
            <div className="overflow-hidden rounded-card bg-canvas shadow-soft">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface text-xs font-bold uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-bold">Device</th>
                    <th className="px-4 py-3 font-bold">Condition</th>
                    <th className="px-4 py-3 font-bold">Vendor</th>
                    <th className="px-4 py-3 font-bold">Stock</th>
                    <th className="px-4 py-3 text-right font-bold">Price</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.reference} className="border-b border-hairline last:border-0 hover:bg-surface/60">
                      <td className="max-w-xs truncate px-4 py-3 font-semibold text-ink">{l.title}</td>
                      <td className="px-4 py-3 text-ink-muted">{TIER_LABEL[l.tier] ?? l.tier}</td>
                      <td className="px-4 py-3 text-ink-muted">{l.vendor}</td>
                      <td className="px-4 py-3 tabular text-ink-muted">
                        {l.stockCount > 0 ? l.stockCount : "Out"}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-bold text-ink">{l.price.display}</td>
                      <td className="px-4 py-3">
                        {l.status === "DRAFT" ? (
                          <Badge tone="amber">Draft</Badge>
                        ) : (
                          <span className="text-xs text-ink-faint">{l.status}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {WITHDRAWABLE.has(l.status) && (
                          <button
                            type="button"
                            onClick={() => withdraw(l)}
                            aria-label={`Withdraw ${l.title}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
