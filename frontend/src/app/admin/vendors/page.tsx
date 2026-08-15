"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type AdminVendor } from "@/lib/api";
import { Card, EmptyState, PageHeading, Skeleton } from "@/components/ui";

export default function AdminVendorsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "vendors"],
    queryFn: () => api.admin.vendors(),
  });

  const vendors = query.data?.vendors ?? [];

  async function remove(v: AdminVendor) {
    try {
      await api.admin.deleteVendor(v.id);
      queryClient.setQueryData<{ vendors: AdminVendor[] } | undefined>(["admin", "vendors"], (data) =>
        data && { vendors: data.vendors.filter((x) => x.id !== v.id) },
      );
      toast.success(`${v.businessName} removed`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that vendor");
    }
  }
  const totalOrders = vendors.reduce((sum, v) => sum + v.ordersFilled, 0);
  const avgMargin = vendors.length
    ? (vendors.reduce((sum, v) => sum + Number(v.marginPercent), 0) / vendors.length).toFixed(1)
    : "0.0";

  return (
    <div className="lg:mx-auto lg:max-w-4xl">
      <div className="flex items-start justify-between gap-3 px-6 pb-0 pt-2 lg:px-12">
        <PageHeading className="px-0">Vendors</PageHeading>
        <Link
          href="/admin/vendors/new"
          className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white shadow-button"
          aria-label="Add vendor"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      {!query.isLoading && vendors.length > 0 && (
        <div className="px-6 lg:px-12">
          <Card className="border-0 bg-surface p-4">
            <p className="text-xs text-ink-muted">
              <span className="font-bold text-ink">{totalOrders} orders</span> filled across{" "}
              {vendors.length} vendor{vendors.length === 1 ? "" : "s"} · Avg margin{" "}
              <span className="font-bold text-ink">{avgMargin}%</span>
            </p>
          </Card>
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-3 px-6 pt-4 lg:px-12">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="px-6 lg:px-12">
          <EmptyState
            icon={<Store className="h-9 w-9" />}
            title="No vendors yet"
            description="Add a vendor to start sourcing stock through them."
          />
        </div>
      ) : (
        <>
          <ul className="space-y-3 px-6 pt-4 lg:hidden">
            {vendors.map((v) => (
              <li key={v.id} className="rounded-card bg-canvas p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-bold text-ink">{v.businessName}</p>
                  <button
                    type="button"
                    onClick={() => remove(v)}
                    aria-label={`Remove ${v.businessName}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {v.location} · {v.supplies.join(", ") || "—"}
                </p>
                <div className="mt-3 flex items-center gap-4 border-t border-hairline pt-3 text-xs text-ink-muted">
                  <span>
                    <span className="font-bold text-ink">{v.ordersFilled}</span> orders
                  </span>
                  <span>
                    Margin <span className="font-bold text-ink">{v.marginPercent}%</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden px-12 pt-4 lg:block">
            <div className="overflow-hidden rounded-card bg-canvas shadow-soft">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-surface text-xs font-bold uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3 font-bold">Vendor</th>
                    <th className="px-4 py-3 font-bold">Location</th>
                    <th className="px-4 py-3 font-bold">Supplies</th>
                    <th className="px-4 py-3 text-right font-bold">Orders filled</th>
                    <th className="px-4 py-3 text-right font-bold">Margin</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v) => (
                    <tr key={v.id} className="border-b border-hairline last:border-0 hover:bg-surface/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{v.businessName}</p>
                        <p className="text-xs text-ink-faint">{v.contactName} · {v.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{v.location}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-ink-muted">
                        {v.supplies.join(", ") || "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-ink">{v.ordersFilled}</td>
                      <td className="tabular px-4 py-3 text-right text-ink">{v.marginPercent}%</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => remove(v)}
                          aria-label={`Remove ${v.businessName}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-faint hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
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
