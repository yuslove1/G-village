"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Receipt as ReceiptIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, PageHeading, Skeleton } from "@/components/ui";
import { cn, formatDate, ORDER_STATUS_LABEL } from "@/lib/utils";

export default function OrderTrackingPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "guest") router.replace(`/login?next=/orders/${reference}`);
  }, [status, reference, router]);

  const query = useQuery({
    queryKey: ["order", reference],
    queryFn: () => api.orders.get(reference),
    enabled: status === "authenticated",
  });

  const order = query.data?.order;

  if (status !== "authenticated" || query.isLoading || !order) {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <PageHeading sub={`Order #${order.reference}`}>
        {ORDER_STATUS_LABEL[order.status] ?? order.status}
      </PageHeading>

      <div className="px-6">
        {order.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-hairline py-3 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{item.title}</p>
              <p className="text-xs text-ink-muted">Qty {item.quantity}</p>
            </div>
            <span className="tabular shrink-0 text-sm font-semibold text-ink">{item.lineTotal.display}</span>
          </div>
        ))}
      </div>

      <div className="px-6 pt-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Timeline</p>
        <ol className="mt-3 space-y-0">
          {order.timeline.map((event, i) => {
            const isLast = i === order.timeline.length - 1;
            return (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral text-white">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                  </span>
                  {!isLast && <span className="w-px flex-1 bg-hairline" aria-hidden />}
                </div>
                <div className={cn("min-w-0 pb-6", isLast && "pb-0")}>
                  <p className="text-sm font-bold text-ink">{ORDER_STATUS_LABEL[event.status] ?? event.status}</p>
                  {event.note && <p className="mt-0.5 text-xs text-ink-muted">{event.note}</p>}
                  <p className="mt-0.5 text-xs text-ink-faint">{formatDate(event.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="px-6 pt-2">
        <Button asChild block variant="outline">
          <Link href={`/orders/${reference}/receipt`}>
            <ReceiptIcon className="h-4 w-4" aria-hidden />
            View receipt
          </Link>
        </Button>
      </div>
    </div>
  );
}
