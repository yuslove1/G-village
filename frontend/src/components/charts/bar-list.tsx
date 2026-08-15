"use client";

/**
 * Magnitude, not identity — every row is the same product dimension (units
 * sold), so this is a single-hue bar list rather than a categorical chart.
 * Position + label already say *which* product; color doesn't need to.
 * Plain HTML/CSS rather than SVG — a horizontal bar list is exactly the
 * shape ordinary flex + width% renders best, per the skill's own guidance
 * to build simple pieces in plain HTML rather than defaulting to SVG for
 * everything.
 */
export function BarList({
  items,
}: {
  items: Array<{ label: string; value: number; valueLabel: string; sublabel?: string }>;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-faint">No sales in this period yet.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-ink">{item.label}</span>
            <span className="tabular shrink-0 text-xs font-bold text-ink">{item.valueLabel}</span>
          </div>
          {/* Bar height capped well under 24px, 4px rounded end at the data
              tip, square at the baseline (the track's own left edge). */}
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-cyan"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
          {item.sublabel && <p className="mt-1 text-[11px] text-ink-muted">{item.sublabel}</p>}
        </li>
      ))}
    </ul>
  );
}
