"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type AdminOrder } from "@/lib/api";
import { Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "New", statuses: ["PAID"] },
  { key: "Sourcing", statuses: ["SOURCING"] },
  { key: "Transit", statuses: ["READY", "IN_TRANSIT"] },
  { key: "Done", statuses: ["DELIVERED"] },
] as const;

const NEXT_STATUS: Record<string, { status: string; label: string }> = {
  PAID: { status: "SOURCING", label: "Mark sourced" },
  SOURCING: { status: "READY", label: "Mark ready" },
  READY: { status: "IN_TRANSIT", label: "Mark in transit" },
  IN_TRANSIT: { status: "DELIVERED", label: "Mark delivered" },
};

export default function AdminOrdersPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("New");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => api.admin.orders(),
  });

  async function advance(order: AdminOrder) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      await api.admin.setOrderStatus(order.reference, next.status);
      queryClient.setQueryData<{ orders: AdminOrder[]; nextCursor: string | null } | undefined>(
        ["admin", "orders"],
        (data) =>
          data && {
            ...data,
            orders: data.orders.map((o) =>
              o.reference === order.reference ? { ...o, status: next.status } : o,
            ),
          },
      );
      toast.success(`Order ${order.reference} → ${next.status}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update that order");
    }
  }

  const orders = query.data?.orders ?? [];
  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, orders.filter((o) => t.statuses.includes(o.status as never)).length]),
  );
  const filtered = orders.filter((o) =>
    TABS.find((t) => t.key === tab)!.statuses.includes(o.status as never),
  );

  return (
    <div className="lg:mx-auto lg:max-w-4xl">
      <PageHeading className="pb-0">Orders</PageHeading>

      <div className="flex gap-2 overflow-x-auto px-6 lg:px-12" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 rounded-pill px-4 py-2 text-sm font-semibold",
              tab === t.key ? "bg-ink text-white" : "bg-surface text-ink-muted",
            )}
          >
            {t.key} {counts[t.key]}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="space-y-3 px-6 pt-5 lg:px-12">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 lg:px-12">
          <EmptyState title="Nothing here" description="No orders in this stage right now." />
        </div>
      ) : (
        <>
          <ul className="space-y-3 px-6 pt-5 lg:hidden">
            {filtered.map((o) => (
              <li key={o.reference} className="rounded-card bg-canvas p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-ink-faint">#{o.reference}</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-ink">{o.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {o.customer} · {o.location ?? "—"}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-sm font-bold text-ink">{o.total.display}</span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3">
                  <Link href={`/admin/orders/${o.reference}`} className="text-xs font-semibold text-ink-muted">
                    View detail
                  </Link>
                  <div className="flex gap-2">
                    {o.vendorPhone && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`tel:${o.vendorPhone}`}>
                          <Phone className="h-3.5 w-3.5" aria-hidden />
                          Vendor
                        </a>
                      </Button>
                    )}
                    {NEXT_STATUS[o.status] && (
                      <Button size="sm" onClick={() => advance(o)}>
                        {NEXT_STATUS[o.status]!.label}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden px-12 pt-5 lg:block">
            <div className="overflow-hidden rounded-card bg-canvas shadow-soft">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface text-xs font-bold uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-bold">Order</th>
                    <th className="px-4 py-3 font-bold">Customer</th>
                    <th className="px-4 py-3 font-bold">Location</th>
                    <th className="px-4 py-3 text-right font-bold">Total</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.reference} className="border-b border-hairline last:border-0 hover:bg-surface/60">
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${o.reference}`} className="block">
                          <p className="text-xs text-ink-faint">#{o.reference}</p>
                          <p className="max-w-xs truncate font-semibold text-ink">{o.title}</p>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{o.customer}</td>
                      <td className="px-4 py-3 text-ink-muted">{o.location ?? "—"}</td>
                      <td className="tabular px-4 py-3 text-right font-bold text-ink">{o.total.display}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {o.vendorPhone && (
                            <Button asChild size="sm" variant="outline">
                              <a href={`tel:${o.vendorPhone}`}>
                                <Phone className="h-3.5 w-3.5" aria-hidden />
                                Vendor
                              </a>
                            </Button>
                          )}
                          {NEXT_STATUS[o.status] && (
                            <Button size="sm" onClick={() => advance(o)}>
                              {NEXT_STATUS[o.status]!.label}
                            </Button>
                          )}
                        </div>
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
