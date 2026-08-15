"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, Card, EmptyState, Field, PageHeading, Skeleton } from "@/components/ui";

export default function PayoutPage() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const banks = useQuery({
    queryKey: ["payout-banks"],
    queryFn: () => api.payouts.banks(),
    enabled: status === "authenticated",
  });

  const payouts = useQuery({
    queryKey: ["payouts"],
    queryFn: () => api.payouts.get(),
    enabled: status === "authenticated",
  });

  const addAccount = useMutation({
    mutationFn: () => api.payouts.addAccount({ bankCode, accountNumber, accountName }),
    onSuccess: () => {
      toast.success("Payout account saved");
      setShowForm(false);
      setBankCode("");
      setAccountNumber("");
      setAccountName("");
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save that account");
    },
  });

  const withdraw = useMutation({
    mutationFn: () => api.payouts.withdraw(),
    onSuccess: (result) => {
      toast.success(`Withdrawal of ${result.amount.display} is on its way`);
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not start that withdrawal");
    },
  });

  async function removeAccount(id: string) {
    try {
      await api.payouts.removeAccount(id);
      queryClient.invalidateQueries({ queryKey: ["payouts"] });
      toast.success("Account removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that account");
    }
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<Wallet className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to see what you're owed and manage your payout account."
        action={
          <Button asChild>
            <Link href="/login?next=/sell/payout">Log in</Link>
          </Button>
        }
      />
    );
  }

  const data = payouts.data;

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <PageHeading>Payout</PageHeading>

      <div className="px-6">
        <Card className="border-0 bg-coral-soft p-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-coral-dark">
            Available balance
          </p>
          {payouts.isLoading ? (
            <Skeleton className="mt-3 h-9 w-32" />
          ) : (
            <p className="tabular mt-2 font-display text-[2.25rem] leading-none text-ink">
              {data?.balance.display ?? "₦0"}
            </p>
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Paid to your account below after each approved direct sale.
          </p>

          {!payouts.isLoading && (
            <>
              {data?.pendingPayout ? (
                <p className="mt-4 text-xs font-bold text-coral-dark">
                  Withdrawal of {data.pendingPayout.amount.display} is processing…
                </p>
              ) : (
                <Button
                  className="mt-4"
                  block
                  disabled={!data || data.balance.kobo === "0" || !data.accounts.length}
                  loading={withdraw.isPending}
                  onClick={() => withdraw.mutate()}
                >
                  Withdraw {data?.balance.display ?? ""}
                </Button>
              )}
            </>
          )}
        </Card>
      </div>

      <div className="px-6 pt-7">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Payout account</p>

        {payouts.isLoading ? (
          <Skeleton className="mt-2 h-20 w-full" />
        ) : (
          <div className="mt-2 space-y-2.5">
            {data?.accounts.map((a) => (
              <Card key={a.id} className="flex items-center gap-3 border-0 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface">
                  <Landmark className="h-4 w-4 text-ink-muted" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">
                    {a.bankName} ···· {a.accountLast4}
                  </span>
                  <span className="block text-xs text-ink-muted">{a.accountName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAccount(a.id)}
                  aria-label="Remove account"
                  className="shrink-0 text-ink-faint"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </Card>
            ))}

            {!showForm && (
              <Button variant="outline" block onClick={() => setShowForm(true)}>
                {data?.accounts.length ? "Add another account" : "Add a payout account"}
              </Button>
            )}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addAccount.mutate();
            }}
            className="mt-3 space-y-3 rounded-card bg-canvas p-4 shadow-soft"
          >
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                Bank
              </label>
              <select
                required
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value)}
                className="h-12 w-full rounded-card border border-hairline bg-canvas px-4 text-sm text-ink outline-none focus:border-coral"
              >
                <option value="" disabled>
                  Select your bank
                </option>
                {banks.data?.banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="Account number"
              inputMode="numeric"
              maxLength={10}
              placeholder="0123456789"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              required
            />

            <Field
              label="Account name"
              placeholder="As it appears on the account"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              required
            />

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={addAccount.isPending}>
                Save
              </Button>
            </div>
          </form>
        )}
      </div>

      {!payouts.isLoading && (data?.recentPayouts.length ?? 0) > 0 && (
        <div className="px-6 pt-7">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Recent payouts</p>
          <div className="mt-2 space-y-2.5">
            {data!.recentPayouts.map((p) => (
              <Card key={p.reference} className="flex items-center justify-between gap-3 border-0 p-4">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink">{p.device}</span>
                  <span className="block text-xs text-ink-muted">
                    {new Date(p.paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-bold text-ink">{p.amount.display}</span>
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-mint">Paid</span>
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
