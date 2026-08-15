"use client";

import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useQuery } from "@tanstack/react-query";
import { Flag, LayoutGrid, Plane, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const TIERS = [
  { value: "", label: "All", Icon: LayoutGrid },
  { value: "NEW", label: "New", Icon: Sparkles },
  { value: "UK_USED", label: "UK used", Icon: Plane },
  { value: "NG_USED", label: "Nigeria used", Icon: Flag },
];

// Round bounds rather than data-derived ones — the seed catalogue tops out
// around ₦750k today, but a slider that rescales itself as inventory changes
// would make the same drag gesture mean a different price every visit.
export const PRICE_MIN = 0;
export const PRICE_MAX = 1_000_000;
const PRICE_STEP = 10_000;

export interface FilterValue {
  tier: string;
  brand: string;
  minNaira: number;
  maxNaira: number;
  verified: boolean;
}

export const DEFAULT_FILTERS: FilterValue = {
  tier: "",
  brand: "",
  minNaira: PRICE_MIN,
  maxNaira: PRICE_MAX,
  verified: false,
};

export function activeFilterCount(f: FilterValue): number {
  return (
    (f.tier ? 1 : 0) +
    (f.brand ? 1 : 0) +
    (f.minNaira > PRICE_MIN || f.maxNaira < PRICE_MAX ? 1 : 0) +
    (f.verified ? 1 : 0)
  );
}

function naira(n: number) {
  return `₦${n.toLocaleString("en-NG")}`;
}

// Same coral-active/hairline-inactive convention as the alerts page's pause
// toggle — duplicated locally rather than shared, since that one lives in a
// route file, not a component other screens import from.
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

export function FilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: FilterValue;
  onApply: (value: FilterValue) => void;
  category?: string;
}) {
  const [draft, setDraft] = useState(value);
  // Separate from `draft` so the number labels track the thumb every frame
  // while dragging, but the count query (and everything downstream of it)
  // only re-fires once the thumb is released — a live network call per pixel
  // of drag would just queue up stale responses behind the current one.
  const [priceLabel, setPriceLabel] = useState<[number, number]>([value.minNaira, value.maxNaira]);

  useEffect(() => {
    if (open) {
      setDraft(value);
      setPriceLabel([value.minNaira, value.maxNaira]);
    }
  }, [open, value]);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.catalog.products(),
    enabled: open,
  });
  const brands = Array.from(new Set(products.data?.products.map((p) => p.brand) ?? [])).sort();

  const count = useQuery({
    queryKey: ["browse-filter-count", draft, category],
    queryFn: () =>
      api.catalog.listings({
        tier: draft.tier || undefined,
        category,
        brand: draft.brand || undefined,
        minKobo: draft.minNaira > PRICE_MIN ? draft.minNaira * 100 : undefined,
        maxKobo: draft.maxNaira < PRICE_MAX ? draft.maxNaira * 100 : undefined,
        verified: draft.verified ? "true" : undefined,
        limit: 48,
      }),
    enabled: open,
  });

  function reset() {
    setDraft(DEFAULT_FILTERS);
    setPriceLabel([PRICE_MIN, PRICE_MAX]);
  }

  function apply() {
    onApply(draft);
    onOpenChange(false);
  }

  const shown = count.data?.listings.length ?? null;
  const hasMore = Boolean(count.data?.nextCursor);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/45 data-[state=open]:animate-fade-up" />
        <DialogPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-[28px] bg-canvas pb-[calc(env(safe-area-inset-bottom)+24px)] focus:outline-none lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:w-full lg:max-w-md lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:pb-6"
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-hairline lg:hidden" aria-hidden />

          <div className="flex items-center justify-between px-6 pt-5">
            <DialogPrimitive.Title className="font-display text-[1.375rem] text-ink">Filters</DialogPrimitive.Title>
            <button type="button" onClick={reset} className="text-xs font-bold text-coral">
              Reset
            </button>
          </div>

          <div className="px-6 pt-6">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Condition</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, tier: t.value }))}
                  aria-pressed={draft.tier === t.value}
                  className={cn(
                    "flex items-center gap-1.5 rounded-pill px-4 py-2 text-sm font-semibold transition-all duration-150 active:translate-y-[3px] active:shadow-none",
                    draft.tier === t.value ? "text-coral shadow-edge-coral" : "text-ink-muted shadow-edge",
                  )}
                >
                  <t.Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 pt-7">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Price range</h3>
            <SliderPrimitive.Root
              className="relative mt-5 flex h-4 w-full touch-none items-center"
              min={PRICE_MIN}
              max={PRICE_MAX}
              step={PRICE_STEP}
              minStepsBetweenThumbs={1}
              value={priceLabel}
              onValueChange={(v) => setPriceLabel(v as [number, number])}
              onValueCommit={(v) => setDraft((d) => ({ ...d, minNaira: v[0]!, maxNaira: v[1]! }))}
            >
              <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-hairline">
                <SliderPrimitive.Range className="absolute h-full rounded-full bg-ink" />
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                className="block h-[22px] w-[22px] rounded-full border-2 border-ink bg-canvas shadow-soft focus:outline-none"
                aria-label="Minimum price"
              />
              <SliderPrimitive.Thumb
                className="block h-[22px] w-[22px] rounded-full border-2 border-ink bg-canvas shadow-soft focus:outline-none"
                aria-label="Maximum price"
              />
            </SliderPrimitive.Root>
            <div className="mt-2 flex justify-between text-[11.5px] text-ink-muted">
              <span>{naira(priceLabel[0])}</span>
              <span>{naira(priceLabel[1])}{priceLabel[1] === PRICE_MAX ? "+" : ""}</span>
            </div>
          </div>

          {brands.length > 0 && (
            <div className="px-6 pt-7">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Brand</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {brands.map((b) => {
                  const selected = draft.brand === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, brand: selected ? "" : b }))}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-pill border px-4 py-2 text-sm font-semibold transition-colors",
                        selected ? "border-coral bg-coral-soft text-coral-dark" : "border-hairline text-ink-muted",
                      )}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 px-6 pt-7">
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Verified only
            </span>
            <Toggle checked={draft.verified} onChange={(v) => setDraft((d) => ({ ...d, verified: v }))} />
          </div>

          <div className="px-6 pt-8">
            <Button block size="lg" loading={count.isFetching} onClick={apply}>
              {shown === null ? "Show results" : `Show ${shown}${hasMore ? "+" : ""} results`}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
