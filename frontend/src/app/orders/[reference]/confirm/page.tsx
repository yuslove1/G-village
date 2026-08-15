"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, CheckCircle2, ChevronRight, Clock, CreditCard, Loader2, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { Button, Skeleton } from "@/components/ui";
import { cn, timeLeft } from "@/lib/utils";

// Short form for "Try {x} again" — the ChoiceCard-style titles below ("Debit
// card") read fine as a label but awkward mid-sentence.
const CHANNELS = [
  { value: "CARD", title: "Debit card", short: "card", Icon: CreditCard },
  { value: "BANK_TRANSFER", title: "Bank transfer", short: "bank transfer", Icon: Building2 },
  { value: "CASH_ON_DELIVERY", title: "Pay on delivery", short: "pay on delivery", Icon: Truck },
] as const;

// Paystack's own redirect lands here (see payment.service.ts's callbackUrl) —
// this is not a client-side navigation, so there is no useMutation lifecycle
// to hook into. It is a page whose entire job is to fire one request on
// mount and show what happened.
function ConfirmContent() {
  const { reference } = useParams<{ reference: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "paid" | "failed">("checking");
  const [remaining, setRemaining] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const paymentReference = params.get("reference") ?? params.get("trxref");
    if (!paymentReference) {
      setState("failed");
      return;
    }
    api.orders
      .confirm(reference, paymentReference)
      .then((res) => setState(res.paid ? "paid" : "failed"))
      .catch(() => setState("failed"));
  }, [reference, params]);

  // Only fetched on failure — the reservation card and retry options need
  // reservedUntil and which channel just declined, neither of which the
  // confirm response carries.
  const order = useQuery({
    queryKey: ["order", reference],
    queryFn: () => api.orders.get(reference),
    enabled: state === "failed",
  });

  useEffect(() => {
    const reservedUntil = order.data?.order.reservedUntil;
    if (!reservedUntil) return;
    const tick = () => setRemaining(timeLeft(reservedUntil));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.data]);

  async function retry(channel: (typeof CHANNELS)[number]["value"]) {
    setRetrying(true);
    try {
      const { payment } = await api.orders.pay(reference, channel, newIdempotencyKey());
      if (payment.authorizationUrl) {
        window.location.href = payment.authorizationUrl;
        return;
      }
      toast.success("Order placed — pay the rider on delivery");
      router.push(`/orders/${reference}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start that payment");
      setRetrying(false);
    }
  }

  if (state === "checking") {
    return (
      <div className="flex flex-col items-center px-8 py-24 text-center">
        <Loader2 className="h-9 w-9 animate-spin text-coral" aria-hidden />
        <p className="mt-4 text-sm text-ink-muted">Confirming your payment…</p>
      </div>
    );
  }

  if (state === "paid") {
    return (
      <div className="flex flex-col items-center px-8 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-soft text-mint">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-display-sm text-ink">Payment successful</h1>
        <p className="mt-2 max-w-xs text-sm text-ink-muted">
          Order #{reference} is confirmed. We'll start sourcing it right away.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild variant="outline">
            <Link href={`/orders/${reference}/receipt`}>View receipt</Link>
          </Button>
          <Button asChild>
            <Link href={`/orders/${reference}`}>Track order</Link>
          </Button>
        </div>
      </div>
    );
  }

  const failedChannel = order.data?.order.payment?.channel ?? "CARD";
  const primary = CHANNELS.find((c) => c.value === failedChannel) ?? CHANNELS[0];
  const alternatives = CHANNELS.filter((c) => c.value !== primary.value);
  const itemTitle = order.data?.order.items[0]?.title ?? "your item";

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-md">
      <div className="flex flex-col items-center px-8 pt-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-soft text-danger">
          <XCircle className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-display-sm text-ink">Payment failed</h1>
        <p className="mt-2 max-w-xs text-sm text-ink-muted">
          Your bank declined the transaction. No money has left your account.
        </p>
      </div>

      {order.isLoading ? (
        <div className="space-y-3 px-6 pt-8">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          {remaining && (
            <div className="mx-6 mt-8 rounded-card bg-surface p-4">
              <p className="text-xs font-bold text-ink">Order held for you</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">
                We've reserved {itemTitle} while you try again. After that it goes back on sale.
              </p>
              <p className="mt-2.5 flex items-center gap-1.5 text-xs font-bold text-amber">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {remaining} remaining
              </p>
            </div>
          )}

          {alternatives.length > 0 && (
            <div className="px-6 pt-7">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Try something else
              </p>
              <div className="mt-2.5 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-canvas">
                {alternatives.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    disabled={retrying}
                    onClick={() => retry(c.value)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-surface",
                      retrying && "opacity-50",
                    )}
                  >
                    <c.Icon className="h-4.5 w-4.5 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
                    <span className="flex-1 text-sm text-ink">{c.title}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 pt-7 pb-10">
            <Button block size="lg" loading={retrying} onClick={() => retry(primary.value)}>
              Try {primary.short} again
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ConfirmPaymentPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmContent />
    </Suspense>
  );
}
