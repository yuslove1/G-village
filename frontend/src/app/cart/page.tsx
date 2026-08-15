"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart, cartCount } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-store";
import { Button, EmptyState, PageHeading } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { TIER_LABEL } from "@/lib/utils";

// The API always hands back money pre-formatted (see Money in lib/utils.ts)
// specifically so nothing on the client re-implements naira formatting —
// except a cart total, which only exists client-side in the first place, so
// there is no server response to read it from. Same grouping rule as the
// backend's formatNaira, kept to this one unavoidable spot.
function formatNairaTotal(totalKobo: bigint): string {
  const grouped = (totalKobo / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₦${grouped}`;
}

export default function CartPage() {
  const router = useRouter();
  const { items, setQuantity, remove } = useCart();
  const { status } = useAuth();

  const subtotalKobo = items.reduce((sum, i) => sum + BigInt(i.price.kobo) * BigInt(i.quantity), 0n);
  const subtotalDisplay = formatNairaTotal(subtotalKobo);

  function onCheckout() {
    router.push(status === "guest" ? "/login?next=/checkout" : "/checkout");
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-9 w-9" />}
        title="Your cart is empty"
        description="Add a device from Browse and it will show up here, ready for checkout."
        action={
          <Button asChild>
            <Link href="/browse">Browse devices</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <PageHeading sub={`${cartCount(items)} item${cartCount(items) === 1 ? "" : "s"}`}>Your cart</PageHeading>

      <ul className="space-y-3 px-6">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3 rounded-card bg-canvas p-3 shadow-soft">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-cyan-soft">
              <DevicePhoto category={item.category} photo={item.photo} alt={item.title} fit="cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-bold text-ink">{item.title}</p>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.title}`}
                  className="shrink-0 text-ink-faint"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">{TIER_LABEL[item.tier] ?? item.tier}</p>

              <div className="mt-2 flex items-center justify-between">
                <p className="tabular text-sm font-bold text-ink">{item.price.display}</p>
                <div className="flex items-center gap-3 rounded-pill bg-surface px-2 py-1">
                  <button
                    type="button"
                    onClick={() => setQuantity(item.id, item.quantity - 1)}
                    aria-label="Decrease quantity"
                    className="flex h-6 w-6 items-center justify-center text-ink-muted"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="tabular w-4 text-center text-sm font-semibold text-ink">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(item.id, item.quantity + 1)}
                    aria-label="Increase quantity"
                    disabled={item.quantity >= 5}
                    className="flex h-6 w-6 items-center justify-center text-ink-muted disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-2.5 rounded-card bg-canvas p-4 shadow-soft mx-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Subtotal</span>
          <span className="tabular font-semibold text-ink">{subtotalDisplay}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Delivery</span>
          <span className="font-semibold text-mint">Free</span>
        </div>
        <div className="flex items-center justify-between border-t border-hairline pt-2.5 text-base">
          <span className="font-bold text-ink">Total</span>
          <span className="tabular font-display text-lg text-ink">{subtotalDisplay}</span>
        </div>
      </div>

      <div className="px-6 pt-6">
        <Button block size="lg" onClick={onCheckout}>
          Checkout
        </Button>
      </div>
    </div>
  );
}
