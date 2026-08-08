"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-45 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        // Ink, not teal. Contrast carries the emphasis so the one accent
        // colour stays reserved for meaning rather than decoration.
        primary: "bg-ink text-white hover:bg-ink-soft",
        outline: "bg-canvas text-ink border border-ink hover:bg-surface",
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
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card bg-canvas hairline", className)} {...props} />;
}

/* ------------------------------------------------------------------- Badge */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-bold leading-none",
  {
    variants: {
      tone: {
        neutral: "bg-surface text-ink-muted",
        teal: "bg-teal-soft text-teal",
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
    NEW: { tone: "teal" as const, label: "New" },
    UK_USED: { tone: "amber" as const, label: "UK used" },
    NG_USED: { tone: "neutral" as const, label: "Nigeria used" },
  };
  const t = map[tier as keyof typeof map] ?? map.NEW;
  return <Badge tone={t.tone}>{t.label}</Badge>;
}

export function VerifiedMark({ label = "Verified" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal">
      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
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
            "flex h-12 items-center rounded-card border bg-canvas px-4 transition-colors focus-within:border-ink",
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
        selected ? "border-teal bg-teal-soft" : "border-hairline bg-canvas hover:bg-surface",
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
          selected ? "border-teal bg-teal" : "border-ink-faint",
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

export function PageHeading({ children, sub }: { children: string; sub?: string }) {
  return (
    <header className="px-6 pb-4 pt-2">
      <h1 className="font-display text-display-md text-ink">
        {children}
        <span className="text-teal">.</span>
      </h1>
      {sub && <p className="mt-1.5 text-sm text-ink-muted">{sub}</p>}
    </header>
  );
}
