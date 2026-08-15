"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        // Coral carries every primary action. One loud colour, used only
        // for the thing you actually want tapped.
        primary: "bg-coral text-white shadow-button hover:bg-coral-dark",
        outline: "bg-canvas text-ink border border-hairline hover:bg-surface",
        quiet: "bg-surface text-ink hover:bg-hairline",
        ghost: "text-ink-muted hover:text-ink hover:bg-surface",
        danger: "bg-danger text-white hover:opacity-90",
      },
      size: {
        sm: "h-9 px-4 text-[13px] rounded-pill",
        md: "h-12 px-6 text-sm rounded-pill",
        lg: "h-[52px] px-7 text-sm rounded-pill",
        icon: "h-10 w-10 rounded-full",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {asChild ? (
          // Slot clones its props onto a single child element — asChild is
          // for wrapping something like a Link, which never has a loading
          // state of its own, so it always gets exactly one child.
          children
        ) : (
          <>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card bg-canvas shadow-soft hairline", className)} {...props} />;
}

/* ------------------------------------------------------------------- Badge */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-surface text-ink-muted",
        coral: "bg-coral-soft text-coral-dark",
        amber: "bg-amber-soft text-amber",
        danger: "bg-danger-soft text-danger",
        ink: "bg-ink text-white",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Tier colour coding is consistent across every surface in the product. */
export function TierBadge({ tier }: { tier: string }) {
  const map = {
    NEW: { tone: "coral" as const, label: "New" },
    UK_USED: { tone: "amber" as const, label: "UK used" },
    NG_USED: { tone: "neutral" as const, label: "Nigeria used" },
  };
  const t = map[tier as keyof typeof map] ?? map.NEW;
  return <Badge tone={t.tone}>{t.label}</Badge>;
}

// Same tier meaning as TierBadge above, but as a corner tab it needs plain
// text + colour rather than a pill's own bg/padding — kept as one lookup so
// the three card surfaces that use it (browse grid, popular grid, carousel)
// can't drift from each other.
const TIER_TAB = {
  NEW: { label: "New", text: "text-coral" },
  UK_USED: { label: "UK used", text: "text-amber" },
  NG_USED: { label: "Nigeria used", text: "text-ink-muted" },
} as const;

/** The badge that reads as cut into a photo's corner — see .corner-tab in
 * globals.css for the concave-curve mechanics. */
export function CornerTab({ tier, className }: { tier: string; className?: string }) {
  const t = TIER_TAB[tier as keyof typeof TIER_TAB] ?? TIER_TAB.NEW;
  return (
    <span
      className={cn(
        "corner-tab flex items-center bg-canvas px-3 py-1.5 text-[11px] font-bold lg:px-3.5 lg:py-2 lg:text-xs",
        t.text,
        className,
      )}
    >
      {t.label}
    </span>
  );
}

/** Price as a solid accent pill instead of plain text — the one thing on a
 * listing card that should out-weigh the title. */
export function PricePill({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "tabular inline-block rounded-pill bg-coral px-3 py-1 text-[13px] font-bold text-white lg:px-4 lg:py-1.5 lg:text-sm",
        className,
      )}
      {...props}
    />
  );
}

/** A solid dot carries the "verified" meaning on its own — the classic
 * social-app checkmark badge — so the label next to it can sit in ordinary
 * ink instead of fighting the mint for attention. */
export function VerifiedMark({ label = "Verified" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-muted lg:text-xs">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-mint lg:h-5 lg:w-5">
        <Check className="h-2.5 w-2.5 text-white lg:h-3 lg:w-3" strokeWidth={4} aria-hidden />
      </span>
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------- Input */

export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, prefix, className, id, ...props }, ref) => {
    const generated = React.useId();
    const fieldId = id ?? generated;
    const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

    return (
      <div className="space-y-2">
        <label
          htmlFor={fieldId}
          className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted"
        >
          {label}
        </label>
        <div
          className={cn(
            "flex h-12 items-center rounded-card border bg-canvas px-4 transition-colors focus-within:border-coral",
            error ? "border-danger" : "border-hairline",
          )}
        >
          {prefix && <span className="mr-2 text-sm text-ink-muted">{prefix}</span>}
          <input
            ref={ref}
            id={fieldId}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={cn(
              "w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint",
              className,
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${fieldId}-error`} className="text-xs text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${fieldId}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Field.displayName = "Field";

/* ------------------------------------------------------------- Choice card */

export function ChoiceCard({
  selected,
  title,
  description,
  icon,
  meta,
  onSelect,
}: {
  selected?: boolean;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  meta?: React.ReactNode;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors",
        selected ? "border-coral bg-coral-soft" : "border-hairline bg-canvas hover:bg-surface",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 text-ink">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {description && <span className="mt-1 block text-xs text-ink-muted">{description}</span>}
        {meta}
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-coral bg-coral" : "border-ink-faint",
        )}
        aria-hidden
      >
        {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-card", className)} />;
}

/* -------------------------------------------------------------- Empty state */

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      {icon && (
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-surface text-ink-faint">
          {icon}
        </div>
      )}
      <h2 className="font-display text-display-sm text-ink">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ Page heading */

export function PageHeading({
  children,
  sub,
  className,
}: {
  children: string;
  sub?: string;
  className?: string;
}) {
  return (
    <header className={cn("px-6 pb-4 pt-2", className)}>
      <h1 className="font-display text-display-md text-ink">
        {children}
        <span className="text-coral">.</span>
      </h1>
      {sub && <p className="mt-1.5 text-sm text-ink-muted">{sub}</p>}
    </header>
  );
}
