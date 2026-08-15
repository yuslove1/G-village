"use client";

import { useMemo, useRef, useState } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { line as d3Line, area as d3Area, curveMonotoneX } from "d3-shape";
import { bisector } from "d3-array";
import { koboToNairaApprox } from "@/lib/utils";

interface Point {
  date: string;
  revenue: { kobo: string; display: string };
}

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 12, bottom: 24, left: 12 };

/**
 * D3's math modules only (d3-scale/d3-shape/d3-array) — no d3-selection, so
 * there's nothing here fighting React for the DOM. React renders every
 * element; D3 just computes where things go. Single series, so per
 * marks-and-anatomy.md this carries no legend box — the card title above it
 * already says what's plotted.
 */
export function RevenueLineChart({ data }: { data: Point[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = useMemo(
    () => data.map((d) => ({ date: new Date(d.date), naira: koboToNairaApprox(d.revenue.kobo), raw: d })),
    [data],
  );

  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = useMemo(() => {
    const extent =
      points.length > 0
        ? [points[0]!.date, points[points.length - 1]!.date]
        : [new Date(), new Date()];
    return scaleTime().domain(extent).range([0, innerWidth]);
  }, [points, innerWidth]);

  const y = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.naira));
    return scaleLinear().domain([0, max]).nice(4).range([innerHeight, 0]);
  }, [points, innerHeight]);

  const linePath = useMemo(
    () =>
      d3Line<(typeof points)[number]>()
        .x((p) => x(p.date))
        .y((p) => y(p.naira))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y],
  );

  const areaPath = useMemo(
    () =>
      d3Area<(typeof points)[number]>()
        .x((p) => x(p.date))
        .y0(innerHeight)
        .y1((p) => y(p.naira))
        .curve(curveMonotoneX)(points) ?? "",
    [points, x, y, innerHeight],
  );

  const ticks = y.ticks(4);

  function onPointerMove(e: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current;
    if (!svg || points.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const localX = (e.clientX - rect.left) * scaleX - MARGIN.left;
    const targetDate = x.invert(localX);

    const bisect = bisector<(typeof points)[number], Date>((p) => p.date).left;
    let i = bisect(points, targetDate, 1);
    const prev = points[i - 1];
    const next = points[i];
    if (prev && next) {
      i = targetDate.getTime() - prev.date.getTime() < next.date.getTime() - targetDate.getTime() ? i - 1 : i;
    } else if (prev) {
      i = i - 1;
    }
    setHoverIndex(Math.max(0, Math.min(points.length - 1, i)));
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const last = points[points.length - 1];

  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-ink-faint">
        No orders in this period
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Revenue over time"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={innerWidth}
                y1={y(t)}
                y2={y(t)}
                className="stroke-hairline"
                strokeWidth={1}
              />
              <text x={0} y={y(t) - 4} className="fill-ink-faint text-[9px]">
                {t === 0 ? "₦0" : `₦${t.toLocaleString("en-NG")}`}
              </text>
            </g>
          ))}

          <path d={areaPath} className="fill-cyan/10" />
          <path d={linePath} fill="none" className="stroke-cyan" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {last && (
            <>
              <circle cx={x(last.date)} cy={y(last.naira)} r={5} className="fill-cyan stroke-canvas" strokeWidth={2} />
              <text
                x={x(last.date)}
                y={y(last.naira) - 12}
                textAnchor="end"
                className="fill-ink text-[10px] font-bold"
              >
                {last.raw.revenue.display}
              </text>
            </>
          )}

          {hovered && (
            <>
              <line
                x1={x(hovered.date)}
                x2={x(hovered.date)}
                y1={0}
                y2={innerHeight}
                className="stroke-ink-faint"
                strokeWidth={1}
              />
              <circle
                cx={x(hovered.date)}
                cy={y(hovered.naira)}
                r={5}
                className="fill-cyan stroke-canvas"
                strokeWidth={2}
              />
            </>
          )}

          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </g>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 rounded-card bg-ink px-3 py-2 text-xs text-white shadow-soft"
          style={{
            left: `${((MARGIN.left + x(hovered.date)) / WIDTH) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-bold">{hovered.raw.revenue.display}</p>
          <p className="text-white/70">
            {hovered.date.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
          </p>
        </div>
      )}
    </div>
  );
}
