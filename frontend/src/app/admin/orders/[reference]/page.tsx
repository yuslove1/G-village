"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Phone } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type AdminOrder } from "@/lib/api";
import { Button, Card, PageHeading, Skeleton } from "@/components/ui";

const NEXT_STATUS: Record<string, { status: string; label: string }> = {
  PAID: { status: "SOURCING", label: "Mark sourced" },
  SOURCING: { status: "READY", label: "Mark ready" },
  READY: { status: "IN_TRANSIT", label: "Mark in transit" },
  IN_TRANSIT: { status: "DELIVERED", label: "Mark delivered" },
};

export default function AdminOrderDetailPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => api.admin.orders(),
  });

  const order = query.data?.orders.find((o) => o.reference === reference);

  async function advance() {
    if (!order) return;
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
      toast.success(`Order → ${next.status}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update that order");
    }
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!order) {
    return <div className="px-6 pt-10 text-center text-sm text-ink-muted">That order isn't in the recent list.</div>;
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={() => router.push("/admin/orders")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <PageHeading sub={order.status}>{`Order #${order.reference}`}</PageHeading>

      <div className="space-y-4 px-6">
        <Card className="border-0 p-5">
          <p className="text-sm font-bold text-ink">{order.title}</p>

          <div className="mt-4 space-y-2 border-t border-hairline pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Margin</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Customer paid</span>
              <span className="tabular font-semibold text-ink">{order.total.display}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Vendor cost</span>
              <span className="tabular font-semibold text-ink">{order.cost.display}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-ink">Your margin</span>
              <span className="tabular font-bold text-mint">{order.margin.display}</span>
            </div>
          </div>
        </Card>

        <Card className="border-0 p-5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Customer</p>
          <p className="mt-2 text-sm font-bold text-ink">{order.customer}</p>
          <a href={`tel:${order.phone}`} className="mt-1 flex items-center gap-1.5 text-xs text-coral">
            <Phone className="h-3 w-3" aria-hidden />
            {order.phone}
          </a>
          {order.location && <p className="mt-1 text-xs text-ink-muted">{order.location}</p>}
        </Card>

        {order.vendor && (
          <Card className="border-0 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Vendor</p>
            <p className="mt-2 text-sm font-bold text-ink">{order.vendor}</p>
            {order.vendorPhone && (
              <a href={`tel:${order.vendorPhone}`} className="mt-1 flex items-center gap-1.5 text-xs text-coral">
                <Phone className="h-3 w-3" aria-hidden />
                {order.vendorPhone}
              </a>
            )}
          </Card>
        )}
      </div>

      <div className="flex gap-3 px-6 pt-6">
        {order.vendorPhone && (
          <Button asChild block variant="outline">
            <a href={`tel:${order.vendorPhone}`}>Call vendor</a>
          </Button>
        )}
        {NEXT_STATUS[order.status] && (
          <Button block onClick={advance}>
            {NEXT_STATUS[order.status]!.label}
          </Button>
        )}
      </div>
    </div>
  );
}
