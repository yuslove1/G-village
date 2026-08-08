"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, PackageOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Button, EmptyState, PageHeading, Skeleton, TierBadge } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { cn } from "@/lib/utils";

const TIERS = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "UK_USED", label: "UK used" },
  { value: "NG_USED", label: "Nigeria used" },
];

export default function BrowsePage() {
  const params = useSearchParams();
  const [tier, setTier] = useState(params.get("tier") ?? "");
  const category = params.get("category") ?? undefined;

  const query = useInfiniteQuery({
    queryKey: ["listings", tier, category],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.catalog.listings({ tier: tier || undefined, category, cursor: pageParam, limit: 20 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const listings = query.data?.pages.flatMap((p) => p.listings) ?? [];

  return (
    <div className="animate-fade-up">
      <div className="flex items-start justify-between px-6 pt-4">
        <PageHeading>Browse</PageHeading>
        <button
          type="button"
          className="mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface"
          aria-label="Filters"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="px-6">
        <Link
          href="/search"
          className="flex h-12 items-center gap-3 rounded-pill bg-surface px-4 text-sm text-ink-faint"
        >
          <Search className="h-5 w-5" aria-hidden />
          Search for a model
        </Link>
      </div>

      <nav aria-label="Condition" className="flex gap-6 overflow-x-auto px-6 pt-6">
        {TIERS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setTier(t.value)}
            aria-pressed={tier === t.value}
            className={cn(
              "shrink-0 pb-2 text-sm transition-colors",
              tier === t.value
                ? "border-b-2 border-teal font-bold text-ink"
                : "text-ink-faint hover:text-ink-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {query.isLoading ? (
        <div className="space-y-4 px-6 pt-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-9 w-9" />}
          title="Nothing here yet"
          description="No devices match that filter right now. Try another condition, or set an alert and we will tell you the moment one lands."
          action={
            <Button asChild variant="outline">
              <Link href="/alerts/new">Set an alert</Link>
            </Button>
          }
        />
      ) : (
        <>
          <p className="px-6 pt-5 text-xs text-ink-faint">{listings.length} shown</p>

          <ul className="px-6">
            {listings.map((l, i) => (
              <li key={l.id}>
                <Link
                  href={`/listing/${l.reference}`}
                  className={cn(
                    "flex items-center gap-4 py-4",
                    i > 0 && "border-t border-hairline",
                  )}
                >
                  <span className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[14px] bg-surface">
                    <DevicePhoto category={l.category} photo={l.photos?.[0]} alt={l.title} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <TierBadge tier={l.tier} />
                    </span>
                    <span className="mt-1.5 block truncate text-sm font-bold text-ink">
                      {l.title}
                    </span>
                    <span className="tabular mt-1 block text-sm font-bold text-ink">
                      {l.price.display}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="px-6 pt-6">
              <Button
                block
                variant="outline"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
