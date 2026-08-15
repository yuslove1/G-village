"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2 } from "lucide-react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { toast } from "sonner";
import { api, ApiError, type Alert } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Badge, Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";
import { cn, TIER_LABEL } from "@/lib/utils";

// First real use of @radix-ui/react-switch in the app — it was already a
// dependency, unused, and a pause/resume toggle is exactly what it is for.
// Styled with the same coral=active, hairline=inactive convention as every
// other on/off state here rather than Radix's unstyled default.
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      className="relative h-6 w-11 shrink-0 rounded-pill bg-hairline transition-colors data-[state=checked]:bg-coral"
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-canvas shadow-soft transition-transform duration-150 data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

export default function AlertsPage() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const alertsQuery = useQuery({
    queryKey: ["alerts"],
    queryFn: () => api.alerts.list(),
    enabled: status === "authenticated",
  });

  async function toggle(alert: Alert) {
    const next = !alert.isActive;
    queryClient.setQueryData<{ alerts: Alert[] } | undefined>(["alerts"], (data) =>
      data && { alerts: data.alerts.map((a) => (a.id === alert.id ? { ...a, isActive: next } : a)) },
    );
    try {
      await api.alerts.update(alert.id, { isActive: next });
    } catch (err) {
      queryClient.setQueryData<{ alerts: Alert[] } | undefined>(["alerts"], (data) =>
        data && { alerts: data.alerts.map((a) => (a.id === alert.id ? { ...a, isActive: !next } : a)) },
      );
      toast.error(err instanceof ApiError ? err.message : "Could not update that alert");
    }
  }

  async function remove(alert: Alert) {
    try {
      await api.alerts.remove(alert.id);
      queryClient.setQueryData<{ alerts: Alert[] } | undefined>(["alerts"], (data) =>
        data && { alerts: data.alerts.filter((a) => a.id !== alert.id) },
      );
      toast.success("Alert removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that alert");
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
        icon={<Bell className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to set alerts and we'll ping you the moment a matching device goes live."
        action={
          <Button asChild>
            <Link href="/login?next=/alerts">Log in</Link>
          </Button>
        }
      />
    );
  }

  const alerts = alertsQuery.data?.alerts ?? [];

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <div className="flex items-start justify-between gap-3 px-6 pt-2">
        <PageHeading className="px-0" sub="We'll ping you the moment a match goes live">
          Alerts
        </PageHeading>
        <Link
          href="/alerts/new"
          className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white shadow-button transition-transform active:scale-95"
          aria-label="New alert"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      {alertsQuery.isLoading ? (
        <div className="space-y-3 px-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-9 w-9" />}
          title="No alerts yet"
          description="Set one for a model, a condition tier or a price ceiling, and we'll notify you the moment it shows up."
          action={
            <Button asChild>
              <Link href="/alerts/new">Set an alert</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3 px-6">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{a.product?.title ?? a.query}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.tiers.map((t) => (
                      <Badge key={t}>{TIER_LABEL[t] ?? t}</Badge>
                    ))}
                    {a.maxPrice && <Badge tone="coral">Under {a.maxPrice.display}</Badge>}
                  </div>
                </div>
                <Toggle checked={a.isActive} onChange={() => toggle(a)} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                <span className={cn("text-[11px] font-semibold", a.matchCount > 0 ? "text-coral" : "text-ink-faint")}>
                  {a.matchCount > 0
                    ? `${a.matchCount} match${a.matchCount === 1 ? "" : "es"} right now`
                    : "No matches yet"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(a)}
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
