"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, newIdempotencyKey, type Address } from "@/lib/api";
import { useCart } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-store";
import { Button, Card, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { TradeInPanel, type TradeInSelection } from "@/components/trade-in-panel";
import { TIER_LABEL } from "@/lib/utils";

function formatNairaTotal(totalKobo: bigint): string {
  const grouped = (totalKobo / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${grouped}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { status } = useAuth();
  const { items, clear } = useCart();
  const [addressId, setAddressId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [tradeIn, setTradeIn] = useState<TradeInSelection | null>(null);
  const [tradeInCreditKobo, setTradeInCreditKobo] = useState<bigint | null>(null);

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (!addressId && addresses.data?.addresses.length) {
      setAddressId(addresses.data.addresses.find((a) => a.isDefault)?.id ?? addresses.data.addresses[0]!.id);
    }
  }, [addresses.data, addressId]);

  useEffect(() => {
    if (status === "guest") router.replace("/login?next=/checkout");
  }, [status, router]);

  const subtotalKobo = items.reduce((sum, i) => sum + BigInt(i.price.kobo) * BigInt(i.quantity), 0n);
  // Mirrors the cap createOrder() itself enforces — credit can zero out a
  // bill but never take it negative — so the preview never promises a total
  // the order won't actually honour.
  const creditKobo = tradeInCreditKobo == null ? 0n : tradeInCreditKobo > subtotalKobo ? subtotalKobo : tradeInCreditKobo;
  const totalKobo = subtotalKobo - creditKobo;
  const totalDisplay = formatNairaTotal(totalKobo);

  async function placeOrder() {
    if (!addressId) {
      toast.error("Add a delivery address first");
      return;
    }
    setPlacing(true);
    try {
      const { order } = await api.orders.create(
        {
          addressId,
          items: items.map((i) => ({ listingId: i.id, quantity: i.quantity })),
          ...(tradeIn ? { tradeIn } : {}),
        },
        newIdempotencyKey(),
      );
      clear();
      router.push(`/orders/${order.reference}/pay`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not place that order");
    } finally {
      setPlacing(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-9 w-9" />}
        title="Your cart is empty"
        description="Add something to your cart before checking out."
        action={
          <Button asChild>
            <Link href="/browse">Browse devices</Link>
          </Button>
        }
      />
    );
  }

  const selected = addresses.data?.addresses.find((a) => a.id === addressId) ?? null;

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <PageHeading>Checkout</PageHeading>

      <section className="px-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Delivery</p>
        {addresses.isLoading ? (
          <Skeleton className="mt-2 h-20 w-full" />
        ) : !addresses.data?.addresses.length ? (
          <Card className="mt-2 flex items-center gap-3 border-0 bg-amber-soft p-4">
            <MapPin className="h-5 w-5 shrink-0 text-amber" aria-hidden />
            <span className="flex-1 text-xs text-ink-muted">
              <span className="font-bold text-ink">No delivery address yet.</span> Add one to continue.
            </span>
            <Link href="/account/addresses/new?next=/checkout" className="text-xs font-bold text-coral">
              Add
            </Link>
          </Card>
        ) : (
          <div className="mt-2 space-y-2">
            {addresses.data.addresses.map((a: Address) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAddressId(a.id)}
                className={`w-full rounded-card border p-4 text-left transition-colors ${
                  addressId === a.id ? "border-coral bg-coral-soft" : "border-hairline bg-canvas"
                }`}
              >
                <p className="text-sm font-bold text-ink">{a.label}</p>
                <p className="mt-1 text-xs text-ink-muted">{a.line1}</p>
                <p className="text-xs text-ink-muted">
                  {a.city}, {a.state}
                </p>
              </button>
            ))}
            <Link href="/account/addresses/new?next=/checkout" className="block text-xs font-semibold text-coral">
              + Add another address
            </Link>
          </div>
        )}
      </section>

      <section className="mt-6 px-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Your order</p>
        <div className="mt-2 divide-y divide-hairline rounded-card bg-canvas p-4 shadow-soft">
          {items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{i.title}</p>
                <p className="text-xs text-ink-muted">
                  {TIER_LABEL[i.tier] ?? i.tier} · Qty {i.quantity}
                </p>
              </div>
              <span className="tabular shrink-0 text-sm font-bold text-ink">{i.price.display}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 px-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Trade-in</p>
        <div className="mt-2">
          <TradeInPanel
            onChange={(selection, credit) => {
              setTradeIn(selection);
              setTradeInCreditKobo(credit);
            }}
          />
        </div>
      </section>

      <section className="mt-6 space-y-2.5 px-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Subtotal</span>
          <span className="tabular font-semibold text-ink">{formatNairaTotal(subtotalKobo)}</span>
        </div>
        {creditKobo > 0n && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">Trade-in credit</span>
            <span className="tabular font-semibold text-mint">−{formatNairaTotal(creditKobo)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Delivery</span>
          <span className="font-semibold text-mint">Free</span>
        </div>
        <div className="flex items-center justify-between border-t border-hairline pt-2.5 text-base">
          <span className="font-bold text-ink">Total</span>
          <span className="tabular font-display text-lg text-ink">{totalDisplay}</span>
        </div>
      </section>

      <div className="px-6 pt-6">
        <Button block size="lg" loading={placing} disabled={!selected} onClick={placeOrder}>
          Pay {totalDisplay}
        </Button>
      </div>
    </div>
  );
}
