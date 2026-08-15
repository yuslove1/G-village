"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type SavedCard } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Badge, Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";

export default function PaymentMethodsPage() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api.paymentMethods.list(),
    enabled: status === "authenticated",
  });

  async function makeDefault(card: SavedCard) {
    try {
      await api.paymentMethods.makeDefault(card.id);
      queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update that card");
    }
  }

  async function remove(card: SavedCard) {
    try {
      await api.paymentMethods.remove(card.id);
      queryClient.setQueryData<{ cards: SavedCard[] } | undefined>(["payment-methods"], (data) =>
        data && { cards: data.cards.filter((c) => c.id !== card.id) },
      );
      toast.success("Card removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that card");
    }
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<CreditCard className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to see cards you've saved for faster checkout."
        action={
          <Button asChild>
            <Link href="/login?next=/account/payment-methods">Log in</Link>
          </Button>
        }
      />
    );
  }

  const cards = query.data?.cards ?? [];

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <PageHeading sub="We never see or store your full card number — Paystack does">
        Payment methods
      </PageHeading>

      {query.isLoading ? (
        <div className="space-y-3 px-6">
          <Skeleton className="h-20 w-full" />
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-9 w-9" />}
          title="No saved cards yet"
          description="Pay by card once at checkout and, if your bank allows it, we'll offer to save it here for next time."
        />
      ) : (
        <ul className="space-y-3 px-6">
          {cards.map((c) => (
            <li key={c.id} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink-muted">
                    <CreditCard className="h-4.5 w-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-ink">
                        {c.cardType.charAt(0).toUpperCase() + c.cardType.slice(1)} •••• {c.last4}
                      </p>
                      {c.isDefault && <Badge tone="coral">Default</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      Expires {c.expMonth}/{c.expYear}
                      {c.bank ? ` · ${c.bank}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                {c.isDefault ? (
                  <span className="text-[11px] text-ink-faint">Used at checkout by default</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(c)}
                    className="flex items-center gap-1 text-xs font-semibold text-coral"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden />
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(c)}
                  className="flex items-center gap-1 text-xs font-semibold text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
