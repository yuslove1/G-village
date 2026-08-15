"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CornerTab, PricePill } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { cn } from "@/lib/utils";
import type { Listing } from "@/lib/api";

/**
 * One slide at a time on mobile, swipe-snapped, dots tracking position — the
 * same interaction as the reference screens' promo banner, except each slide
 * is a real listing instead of a generic discount ribbon. Widens out to 2–4
 * visible slides at once as the viewport grows, where dots stop making sense
 * and the scroll becomes closer to an overflow shelf than a carousel.
 */
export function HotCarousel({ listings }: { listings: Listing[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (listings.length === 0) return null;

  return (
    <div>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 lg:px-12"
      >
        {listings.map((l) => (
          <Link
            key={l.id}
            href={`/listing/${l.reference}`}
            // One slide peeking at the next on mobile; enough width at each
            // breakpoint that 2–3 sit side by side instead of one giant card
            // swallowing a desktop viewport. Capped at 31% rather than
            // scaling to a 4th at xl: — "hot right now" only ever has a
            // handful of NEW-tier listings, so sizing for a slide count
            // wider than the data usually has just leaves a gap.
            className="group relative aspect-[4/3] w-[82%] shrink-0 snap-center overflow-hidden rounded-card shadow-soft transition-transform duration-150 active:scale-[0.98] sm:w-[46%] lg:w-[31%]"
          >
            <div className="h-full w-full transition-transform duration-300 group-active:scale-110">
              <DevicePhoto category={l.category} photo={l.photos?.[0]} alt={l.title} fit="cover" />
            </div>
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent"
              aria-hidden
            />
            <CornerTab tier={l.tier} />
            <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5">
              <p className="truncate text-sm font-bold text-white lg:text-base">{l.title}</p>
              <PricePill className="mt-1.5 lg:mt-2">{l.price.display}</PricePill>
            </div>
          </Link>
        ))}
      </div>

      {/* Dots track "which single slide is active," a question that stops
          meaning anything once sm: and up shows several at once. */}
      {listings.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 sm:hidden" aria-hidden>
          {listings.map((l, i) => (
            <span
              key={l.id}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === active ? "w-4 bg-coral" : "w-1.5 bg-hairline",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
