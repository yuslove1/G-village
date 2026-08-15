"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Mail, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button, Field, PageHeading } from "@/components/ui";
import { cn } from "@/lib/utils";

const TIERS = [
  { value: "NEW", label: "New" },
  { value: "UK_USED", label: "UK used" },
  { value: "NG_USED", label: "Nigeria used" },
] as const;

const CHANNELS = [
  { key: "viaPush" as const, label: "Push", icon: Bell },
  { key: "viaEmail" as const, label: "Email", icon: Mail },
  { key: "viaSms" as const, label: "SMS", icon: MessageSquare },
];

type Product = { id: string; brand: string; model: string; variant: string | null; category: string };

export default function NewAlertPage() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [tiers, setTiers] = useState<Set<string>>(new Set());
  const [maxPrice, setMaxPrice] = useState("");
  const [channels, setChannels] = useState({ viaPush: true, viaEmail: true, viaSms: false });
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.catalog.products(),
  });

  // Client-side filter over a small, already-fetched catalogue rather than a
  // dedicated search endpoint — /catalog/products has no ?q= today, and 200
  // rows is cheap to filter in the browser.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || product) return [];
    return (products.data?.products ?? [])
      .filter((p) => [p.brand, p.model, p.variant].filter(Boolean).join(" ").toLowerCase().includes(q))
      .slice(0, 5);
  }, [query, product, products.data]);

  function toggleTier(value: string) {
    setTiers((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      await api.alerts.create({
        productId: product?.id,
        query: product ? undefined : query.trim() || undefined,
        tiers: [...tiers],
        maxKobo: maxPrice ? Number(maxPrice) * 100 : undefined,
        ...channels,
      });
      toast.success("Alert set — we'll let you know");
      router.push("/alerts");
    } catch (err) {
      if (err instanceof ApiError && err.fields?.some((f) => f.path === "query")) {
        setError(err.fields.find((f) => f.path === "query")?.message);
      }
      toast.error(err instanceof ApiError ? err.message : "Could not save that alert");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-xl">
      <div className="px-6 pt-4">
        <Link
          href="/alerts"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
      </div>

      <PageHeading sub="Pin a device, or just describe what you're after">New alert</PageHeading>

      <form onSubmit={onSubmit} className="space-y-6 px-6">
        <div className="relative">
          {product ? (
            <div className="flex h-12 items-center justify-between rounded-card border border-coral bg-coral-soft px-4">
              <span className="truncate text-sm font-semibold text-ink">
                {[product.brand, product.model, product.variant].filter(Boolean).join(" ")}
              </span>
              <button
                type="button"
                onClick={() => {
                  setProduct(null);
                  setQuery("");
                }}
                aria-label="Clear selected device"
                className="shrink-0 text-ink-muted"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <Field
              label="Model or keywords"
              placeholder="e.g. iPhone 13 Pro, or just 'Pro Max'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              error={error}
              hint={!error ? "Pick a suggestion to pin an exact model, or leave as free text" : undefined}
            />
          )}

          {suggestions.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1.5 space-y-1 rounded-card bg-canvas p-1.5 shadow-soft">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProduct(p);
                      setQuery("");
                    }}
                    className="w-full rounded-[10px] px-3 py-2 text-left text-sm text-ink hover:bg-surface"
                  >
                    {[p.brand, p.model, p.variant].filter(Boolean).join(" ")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Condition</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => toggleTier(t.value)}
                aria-pressed={tiers.has(t.value)}
                className={cn(
                  "rounded-pill px-4 py-2 text-sm font-semibold transition-all active:translate-y-[3px] active:shadow-none",
                  tiers.has(t.value) ? "bg-coral-soft text-coral-dark shadow-edge-coral" : "bg-surface text-ink-muted shadow-edge",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">Leave all unselected to match any condition</p>
        </div>

        <Field
          label="Maximum price (optional)"
          type="number"
          inputMode="numeric"
          min={0}
          prefix="₦"
          placeholder="500000"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
        />

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Notify me by</p>
          <div className="mt-2 flex gap-2">
            {CHANNELS.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={channels[key] ? "primary" : "outline"}
                onClick={() => setChannels((c) => ({ ...c, [key]: !c[key] }))}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        </div>

        <Button type="submit" block size="lg" loading={submitting}>
          Set alert
        </Button>
      </form>
    </div>
  );
}
