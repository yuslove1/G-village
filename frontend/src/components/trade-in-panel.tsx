"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Headphones,
  Laptop,
  Repeat,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TriangleAlert,
  Watch,
  X,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Field, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<string, typeof Smartphone> = {
  phone: Smartphone,
  laptop: Laptop,
  wearable: Watch,
  audio: Headphones,
};

// Same severity icons as the sell wizard's condition step and the listing
// detail page — one meaning for "Excellent" everywhere it appears.
const GRADES = [
  { value: "MINT", label: "Flawless", Icon: Sparkles },
  { value: "EXCELLENT", label: "Light marks", Icon: ShieldCheck },
  { value: "GOOD", label: "Scratched", Icon: TriangleAlert },
  { value: "FAIR", label: "Cracked", Icon: XCircle },
] as const;

export interface TradeInSelection {
  productId: string;
  grade: string;
  batteryHealth?: number;
  ageMonths: number;
}

/**
 * Deferred by choice in the original build (see SCREENS_TODO.md) — the
 * backend already accepted a tradeIn object on POST /orders, this is the
 * missing collection step. Runs the same appraisal engine as the sell
 * wizard but through /sales/trade-in-quote, which returns the discounted
 * credit createOrder() actually applies rather than the sell flow's full
 * cash offer — showing the seller-facing number here would quote a bigger
 * credit than checkout ends up giving.
 */
export function TradeInPanel({
  onChange,
}: {
  onChange: (selection: TradeInSelection | null, creditKobo: bigint | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [grade, setGrade] = useState<string>("EXCELLENT");
  const [battery, setBattery] = useState<number | "">("");
  const [ageMonths, setAgeMonths] = useState(18);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.catalog.products(),
    enabled: open,
  });

  const credit = useQuery({
    queryKey: ["trade-in-credit", productId, grade, battery, ageMonths],
    queryFn: () =>
      api.sales.tradeInQuote({
        productId,
        grade,
        ageMonths,
        batteryHealth: battery === "" ? undefined : battery,
      }),
    enabled: Boolean(productId),
  });

  useEffect(() => {
    if (!productId || !credit.data) {
      onChange(null, null);
      return;
    }
    onChange(
      { productId, grade, ageMonths, batteryHealth: battery === "" ? undefined : battery },
      BigInt(credit.data.credit.kobo),
    );
    // onChange identity is expected to be stable from the caller (checkout
    // wraps it in useCallback-free state setters); including it here would
    // just re-fire this on every parent render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, grade, ageMonths, battery, credit.data]);

  function remove() {
    setProductId("");
    setOpen(false);
    onChange(null, null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-card border border-dashed border-ink-faint p-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-soft text-cyan-dark">
            <Repeat className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-bold text-ink">Trade in a device</span>
            <span className="block text-xs text-ink-muted">Lower this bill with your old phone or laptop</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
      </button>
    );
  }

  return (
    <Card className="border-0 p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-base text-ink">Trade in</p>
        <button
          type="button"
          onClick={remove}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-ink-muted"
          aria-label="Remove trade-in"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Your device</p>
      {products.isLoading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
          {products.data?.products.map((p) => {
            const CategoryIcon = CATEGORY_ICON[p.category] ?? Smartphone;
            const title = [p.brand, p.model, p.variant].filter(Boolean).join(" ");
            const selected = productId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setProductId(p.id)}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center gap-3 rounded-card border p-3 text-left transition-colors",
                  selected ? "border-coral bg-coral-soft" : "border-hairline bg-canvas",
                )}
              >
                <CategoryIcon className="h-4 w-4 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{title}</span>
              </button>
            );
          })}
        </div>
      )}

      {productId && (
        <>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-ink-muted">Condition</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGrade(g.value)}
                aria-pressed={grade === g.value}
                className={cn(
                  "flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-xs font-semibold transition-all duration-150 active:translate-y-[3px] active:shadow-none",
                  grade === g.value ? "text-coral shadow-edge-coral" : "text-ink-muted shadow-edge",
                )}
              >
                <g.Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {g.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field
              label="Age (months)"
              type="number"
              inputMode="numeric"
              min={0}
              max={240}
              value={ageMonths}
              onChange={(e) => setAgeMonths(Number(e.target.value))}
            />
            <Field
              label="Battery %"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="87"
              value={battery}
              onChange={(e) => setBattery(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>

          <div className="mt-4 rounded-card bg-mint-soft p-4">
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-mint">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Trade-in credit
            </p>
            {credit.isLoading ? (
              <Skeleton className="mt-2 h-8 w-32 bg-canvas/60" />
            ) : (
              <p className="tabular mt-1 font-display text-2xl text-ink">
                {credit.data?.credit.display ?? "—"}
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-muted">Confirmed after our agent inspects your device</p>
          </div>

          <button type="button" onClick={remove} className="mt-3 text-xs font-bold text-coral">
            Remove trade-in
          </button>
        </>
      )}
    </Card>
  );
}
