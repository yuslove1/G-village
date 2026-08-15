"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageOpen, Store, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type SaleSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { formatDate, SALE_STATUS_LABEL } from "@/lib/utils";

const CANCELLABLE = new Set(["QUOTED", "BOOKED"]);

export default function MySalesPage() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["sales"],
    queryFn: () => api.sales.list(),
    enabled: status === "authenticated",
  });

  async function cancel(sale: SaleSummary) {
    try {
      await api.sales.cancel(sale.reference);
      queryClient.setQueryData<{ sales: SaleSummary[] } | undefined>(["sales"], (data) =>
        data && { sales: data.sales.map((s) => (s.reference === sale.reference ? { ...s, status: "CANCELLED" } : s)) },
      );
      toast.success("Sale cancelled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not cancel that sale");
    }
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<Store className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to see devices you've sold or listed with us."
        action={
          <Button asChild>
            <Link href="/login?next=/sell/mine">Log in</Link>
          </Button>
        }
      />
    );
  }

  const sales = query.data?.sales ?? [];

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <div className="flex items-start justify-between gap-3 px-6 pt-2">
        <PageHeading className="px-0">My sales</PageHeading>
        <Link href="/sell/payout" className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-coral">
          <Wallet className="h-3.5 w-3.5" aria-hidden />
          Payout
        </Link>
      </div>

      {query.isLoading ? (
        <div className="space-y-3 px-6">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : sales.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-9 w-9" />}
          title="Nothing sold yet"
          description="Start a sale to get an instant offer on a device."
          action={
            <Button asChild>
              <Link href="/sell">Sell a gadget</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3 px-6">
          {sales.map((s) => (
            <li key={s.reference} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-faint">#{s.reference}</p>
                  <p className="mt-0.5 truncate text-sm font-bold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {s.mode === "DIRECT" ? "Sell direct" : "Listed · 15% fee"} · {formatDate(s.createdAt)}
                  </p>
                </div>
                <span className="tabular shrink-0 text-sm font-bold text-ink">
                  {(s.finalOffer ?? s.offer).display}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-coral">
                  <Wallet className="h-3.5 w-3.5" aria-hidden />
                  {SALE_STATUS_LABEL[s.status] ?? s.status}
                </span>
                {CANCELLABLE.has(s.status) && (
                  <button
                    type="button"
                    onClick={() => cancel(s)}
                    className="flex items-center gap-1 text-xs font-semibold text-danger"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
