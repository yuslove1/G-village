"use client";

import Link from "next/link";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useMutation } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";

// Same coral-active/hairline-inactive convention as the alerts page's pause
// toggle and the checkout trade-in step — duplicated locally rather than
// shared, same call made on those.
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

type Key = "notifyOrderUpdates" | "notifyPriceAlerts" | "notifyMarketing";

const ROWS: Array<{ key: Key; title: string; description: string }> = [
  {
    key: "notifyOrderUpdates",
    title: "Order & delivery updates",
    description: "Payment confirmed, sourcing, out for delivery — the status changes on things you've bought.",
  },
  {
    key: "notifyPriceAlerts",
    title: "Price alerts",
    description: "When a listing matches one of your saved alerts.",
  },
  {
    key: "notifyMarketing",
    title: "Marketing & promotions",
    description: "Occasional email about new stock and offers. Off by default.",
  },
];

export default function NotificationsPage() {
  const { user, status, setUser } = useAuth();

  const update = useMutation({
    mutationFn: (body: Partial<Pick<User, Key>>) => api.auth.updateNotifications(body),
    onSuccess: ({ user }) => setUser(user),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not update that preference");
    },
  });

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (status === "guest" || !user) {
    return (
      <EmptyState
        icon={<Bell className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to manage what Gadgetvillage gets in touch about."
        action={
          <Button asChild>
            <Link href="/login?next=/account/notifications">Log in</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <PageHeading sub="Choose what we get in touch about">Notifications</PageHeading>

      <div className="mx-6 divide-y divide-hairline rounded-card bg-canvas px-4 shadow-soft">
        {ROWS.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-4 py-4">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-ink">{row.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{row.description}</span>
            </span>
            <div className="pt-0.5">
              <Toggle
                checked={user[row.key]}
                onChange={(v) => {
                  setUser({ ...user, [row.key]: v });
                  update.mutate({ [row.key]: v });
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
