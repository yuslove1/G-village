"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type Address } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { Badge, Button, EmptyState, PageHeading, Skeleton } from "@/components/ui";

export default function AddressesPage() {
  const { status } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: status === "authenticated",
  });

  async function makeDefault(address: Address) {
    try {
      await api.addresses.update(address.id, { isDefault: true });
      queryClient.invalidateQueries({ queryKey: ["addresses"] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update that address");
    }
  }

  async function remove(address: Address) {
    try {
      await api.addresses.remove(address.id);
      queryClient.setQueryData<{ addresses: Address[] } | undefined>(["addresses"], (data) =>
        data && { addresses: data.addresses.filter((a) => a.id !== address.id) },
      );
      toast.success("Address removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that address");
    }
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="space-y-3 px-6 pt-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<MapPin className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to save delivery addresses for faster checkout."
        action={
          <Button asChild>
            <Link href="/login?next=/account/addresses">Log in</Link>
          </Button>
        }
      />
    );
  }

  const addresses = query.data?.addresses ?? [];

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-2xl">
      <div className="flex items-start justify-between gap-3 px-6 pt-2">
        <PageHeading className="px-0">Addresses</PageHeading>
        <Link
          href="/account/addresses/new"
          className="mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral text-white shadow-button transition-transform active:scale-95"
          aria-label="Add address"
        >
          <Plus className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      {query.isLoading ? (
        <div className="space-y-3 px-6">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-9 w-9" />}
          title="No addresses yet"
          description="Add a delivery address so checkout only takes one tap next time."
          action={
            <Button asChild>
              <Link href="/account/addresses/new">Add an address</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3 px-6">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-card bg-canvas p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink">{a.label}</p>
                    {a.isDefault && <Badge tone="coral">Default</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{a.line1}</p>
                  <p className="text-xs text-ink-muted">
                    {a.city}, {a.state}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">{a.phone}</p>
                </div>
                <Link
                  href={`/account/addresses/new?id=${a.id}`}
                  aria-label={`Edit ${a.label}`}
                  className="shrink-0 text-ink-faint"
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
                {a.isDefault ? (
                  <span className="text-[11px] text-ink-faint">Used at checkout by default</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => makeDefault(a)}
                    className="text-xs font-semibold text-coral"
                  >
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(a)}
                  className="flex items-center gap-1 text-xs font-semibold text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
