"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CreditCard,
  Heart,
  LogOut,
  MapPin,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, Card, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { initials, ORDER_STATUS_LABEL, SALE_STATUS_LABEL } from "@/lib/utils";

const LINKS = [
  { href: "/cart", label: "Cart", icon: ShoppingBag },
  { href: "/wishlist", label: "Saved", icon: Heart },
  { href: "/sell", label: "Sell a gadget", icon: Plus },
  { href: "/sell/mine", label: "My sales", icon: Store },
  { href: "/sell/payout", label: "Payout", icon: Wallet },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/payment-methods", label: "Payment methods", icon: CreditCard },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
];

export default function AccountPage() {
  const router = useRouter();
  const { user, status, logout } = useAuth();

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
    enabled: status === "authenticated",
  });
  const sales = useQuery({
    queryKey: ["sales"],
    queryFn: () => api.sales.list(),
    enabled: status === "authenticated",
  });
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api.alerts.list(),
    enabled: status === "authenticated",
  });

  async function onLogout() {
    await logout();
    toast.success("Logged out");
    router.push("/");
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to track orders, manage listings and see your saved devices."
        action={
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link href="/signup">Create account</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        }
      />
    );
  }

  if (!user) return null;

  const recentOrders = (orders.data?.orders ?? []).slice(0, 2);
  const activeSale = sales.data?.sales.find((s) => !["REJECTED", "CANCELLED"].includes(s.status));
  const topAlerts = (alerts.data?.alerts ?? []).slice(0, 2);

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <PageHeading>Your account</PageHeading>

      <div className="px-6">
        <Card className="flex items-center gap-4 border-0 p-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-coral-soft text-lg font-bold text-coral-dark">
            {initials(user.fullName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-ink">{user.fullName}</span>
            {(user.city || user.state) && (
              <span className="block truncate text-xs text-ink-muted">
                {[user.city, user.state].filter(Boolean).join(", ")}
              </span>
            )}
            <span className="block truncate text-xs text-ink-muted">{user.phone}</span>
            {user.email && <span className="block truncate text-xs text-ink-muted">{user.email}</span>}
          </span>
        </Card>

        {!user.phoneVerified && (
          <Link
            href="/verify"
            className="mt-3 flex items-center gap-3 rounded-card bg-amber-soft p-4 transition-colors active:bg-amber-soft/70"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber" aria-hidden />
            <span className="flex-1 text-xs leading-relaxed text-ink-muted">
              <span className="font-bold text-ink">Phone not verified.</span> Verify it to buy, sell or
              trade in.
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
          </Link>
        )}

        {/* Recent orders — skipped entirely rather than shown empty. A
            dashboard with three empty preview sections reads as broken; a
            shorter dashboard with only what's actually happening reads as
            calm. */}
        {orders.isLoading ? (
          <Skeleton className="mt-5 h-20 w-full" />
        ) : (
          recentOrders.length > 0 && (
            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-ink">Recent orders</h2>
                <Link href="/orders" className="text-xs font-semibold text-coral">
                  View all
                </Link>
              </div>
              <div className="mt-2 divide-y divide-hairline rounded-card bg-canvas shadow-soft">
                {recentOrders.map((o) => (
                  <Link
                    key={o.reference}
                    href={`/orders/${o.reference}`}
                    className="flex items-center gap-3 px-4 py-3.5"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-soft text-cyan-dark">
                      <Package className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{o.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-bold text-ink">{o.total.display}</span>
                  </Link>
                ))}
              </div>
            </section>
          )
        )}

        {sales.isLoading ? null : (
          activeSale && (
            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-ink">Selling</h2>
                <Link href="/sell/mine" className="text-xs font-semibold text-coral">
                  View all
                </Link>
              </div>
              <Link
                href="/sell/mine"
                className="mt-2 flex items-center gap-3 rounded-card bg-canvas p-4 shadow-soft"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-coral-soft text-coral-dark">
                  <Store className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{activeSale.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {SALE_STATUS_LABEL[activeSale.status] ?? activeSale.status}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm font-bold text-ink">
                  {(activeSale.finalOffer ?? activeSale.offer).display}
                </span>
              </Link>
            </section>
          )
        )}

        {alerts.isLoading ? null : (
          topAlerts.length > 0 && (
            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-ink">Saved alerts</h2>
                <Link href="/alerts" className="text-xs font-semibold text-coral">
                  View all
                </Link>
              </div>
              <div className="mt-2 divide-y divide-hairline rounded-card bg-canvas shadow-soft">
                {topAlerts.map((a) => (
                  <Link key={a.id} href="/alerts" className="flex items-center gap-3 px-4 py-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink-muted">
                      <Bell className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {a.product?.title ?? a.query}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {a.maxPrice ? `Under ${a.maxPrice.display}` : "Any price"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-bold ${a.matchCount > 0 ? "text-coral" : "text-ink-faint"}`}
                    >
                      {a.matchCount > 0 ? `${a.matchCount} match${a.matchCount === 1 ? "" : "es"}` : "No matches"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )
        )}

        <div className="mt-6 divide-y divide-hairline rounded-card bg-canvas shadow-soft">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-4 py-3.5">
              <Icon className="h-[18px] w-[18px] text-ink-muted" strokeWidth={1.75} aria-hidden />
              <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
              <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-5 flex w-full items-center gap-3 rounded-card bg-canvas px-4 py-3.5 shadow-soft"
        >
          <LogOut className="h-[18px] w-[18px] text-danger" strokeWidth={1.75} aria-hidden />
          <span className="text-sm font-semibold text-danger">Log out</span>
        </button>
      </div>
    </div>
  );
}
