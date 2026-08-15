"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, newIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Badge, Button, ChoiceCard, PageHeading, Skeleton } from "@/components/ui";
import { timeLeft } from "@/lib/utils";

const CHANNELS = [
  { value: "CARD", title: "Debit card", description: "Visa, Mastercard, Verve", Icon: CreditCard },
  { value: "BANK_TRANSFER", title: "Bank transfer", description: "Pay from your banking app", Icon: Building2 },
  { value: "CASH_ON_DELIVERY", title: "Pay on delivery", description: "Cash or transfer to our rider", Icon: Truck },
] as const;

export default function PaymentMethodPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const { status } = useAuth();

  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["value"]>("CARD");
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (status === "guest") router.replace(`/login?next=/orders/${reference}/pay`);
  }, [status, reference, router]);

  const query = useQuery({
    queryKey: ["order", reference],
    queryFn: () => api.orders.get(reference),
    enabled: status === "authenticated",
  });

  const cards = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api.paymentMethods.list(),
    enabled: status === "authenticated",
  });
  const savedCards = cards.data?.cards ?? [];

  // Same "default wins on first load" convention as checkout's own address
  // picker — one tap saved for the common case, still fully overridable.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || savedCards.length === 0) return;
    autoSelected.current = true;
    const preferred = savedCards.find((c) => c.isDefault) ?? savedCards[0]!;
    setChannel("CARD");
    setSavedCardId(preferred.id);
  }, [savedCards]);

  const order = query.data?.order;

  useEffect(() => {
    if (!order) return;
    if (order.status !== "PENDING_PAYMENT") {
      router.replace(`/orders/${reference}`);
      return;
    }
    const tick = () => setRemaining(timeLeft(order.reservedUntil));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order, reference, router]);

  async function onPay() {
    setPaying(true);
    try {
      const { payment } = await api.orders.pay(
        reference,
        channel,
        newIdempotencyKey(),
        savedCardId ?? undefined,
      );

      if (payment.authorizationUrl) {
        window.location.href = payment.authorizationUrl;
        return;
      }

      // A saved card charges synchronously — no hosted page to redirect to,
      // so `paid` tells us the outcome directly instead of leaving it to the
      // webhook. Cash on delivery has neither a redirect nor a paid outcome
      // (nothing has been charged yet), which is the undefined case below.
      if (payment.paid === true) {
        toast.success("Payment successful");
        router.push(`/orders/${reference}`);
        return;
      }
      if (payment.paid === false) {
        router.push(`/orders/${reference}/confirm`);
        return;
      }

      toast.success("Order placed — pay the rider on delivery");
      router.push(`/orders/${reference}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start that payment");
      setPaying(false);
    }
  }

  if (status !== "authenticated" || query.isLoading || !order) {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <PageHeading sub="How would you like to pay?">Payment</PageHeading>

      {remaining && (
        <p className="px-6 text-xs text-ink-muted">
          Reserved for you — <span className="tabular font-bold text-coral">{remaining}</span> left
        </p>
      )}

      {savedCards.length > 0 && (
        <div className="mt-4 space-y-2.5 px-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Saved cards</p>
          {savedCards.map((c) => (
            <ChoiceCard
              key={c.id}
              selected={channel === "CARD" && savedCardId === c.id}
              icon={<CreditCard className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
              title={`${c.cardType.charAt(0).toUpperCase() + c.cardType.slice(1)} •••• ${c.last4}`}
              description={`Expires ${c.expMonth}/${c.expYear}`}
              meta={c.isDefault ? <Badge tone="coral" className="mt-1.5">Default</Badge> : undefined}
              onSelect={() => {
                setChannel("CARD");
                setSavedCardId(c.id);
              }}
            />
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2.5 px-6">
        {savedCards.length > 0 && (
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Other ways to pay</p>
        )}
        {CHANNELS.map((c) => (
          <ChoiceCard
            key={c.value}
            selected={channel === c.value && savedCardId === null}
            icon={<c.Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />}
            title={c.value === "CARD" && savedCards.length > 0 ? "Pay with a new card" : c.title}
            description={c.description}
            onSelect={() => {
              setChannel(c.value);
              setSavedCardId(null);
            }}
          />
        ))}
      </div>

      <div className="px-6 pt-6">
        <Button block size="lg" loading={paying} onClick={onPay}>
          Pay {order.total.display}
        </Button>
      </div>
    </div>
  );
}
