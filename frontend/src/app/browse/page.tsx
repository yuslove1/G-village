"use client";

import { Suspense, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Flag,
  Heart,
  LayoutGrid,
  Plane,
  Search,
  SlidersHorizontal,
  Sparkles,
  PackageOpen,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button, CornerTab, EmptyState, PageHeading, PricePill, Skeleton } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { useWishlist } from "@/lib/use-wishlist";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  FilterSheet,
  PRICE_MAX,
  PRICE_MIN,
  type FilterValue,
} from "@/components/filter-sheet";
import { cn } from "@/lib/utils";

// Distinct from Grid2x2 (already the Browse nav-tab icon) and MapPin
// (already the location badge on the home page), so these don't read as
// pointing at the wrong thing.
const TIERS = [
  { value: "", label: "All", Icon: LayoutGrid },
  { value: "NEW", label: "New", Icon: Sparkles },
  { value: "UK_USED", label: "UK used", Icon: Plane },
  { value: "NG_USED", label: "Nigeria used", Icon: Flag },
];

// One consistent halo behind every photo rather than a rotating set of
// tints — same call as the home grid, and it keeps the two screens reading
// as one product. Cyan-soft, coral's complement, so the coral badges and
// accents sitting on top of it actually pop.
const HALO = "bg-cyan-soft";

function BrowseContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [filters, setFilters] = useState<FilterValue>({
    ...DEFAULT_FILTERS,
    tier: params.get("tier") ?? "",
  });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const category = params.get("category") ?? undefined;
  const wishlist = useWishlist();

  function onToggleSave(listingId: string) {
    if (!wishlist.isAuthenticated) {
      router.push("/login?next=/browse");
      return;
    }
    wishlist.toggle(listingId);
  }

  const query = useInfiniteQuery({
    queryKey: ["listings", filters, category],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.catalog.listings({
        tier: filters.tier || undefined,
        category,
        brand: filters.brand || undefined,
        minKobo: filters.minNaira > PRICE_MIN ? filters.minNaira * 100 : undefined,
        maxKobo: filters.maxNaira < PRICE_MAX ? filters.maxNaira * 100 : undefined,
        verified: filters.verified ? "true" : undefined,
        cursor: pageParam,
        limit: 20,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const filterCount = activeFilterCount(filters);

  const listings = query.data?.pages.flatMap((p) => p.listings) ?? [];

  return (
    <div className="animate-fade-up">
      {/* Same restructure as the home hero: heading on the left, search +
          its filter button + chips grouped on the right, sharing one row
          at lg: instead of three stacked full-width rows leaving the right
          two-thirds of the page empty. Filter button now pairs with the
          search input (not the heading) to match the home page. */}
      <div className="px-6 lg:flex lg:items-start lg:justify-between lg:gap-12 lg:px-12">
        <PageHeading className="px-0 pt-4 lg:pt-0">Browse</PageHeading>

        <div className="lg:w-full lg:max-w-xl">
          <div className="flex items-center gap-3">
            <Link
              href="/search"
              className="flex h-12 flex-1 items-center gap-3 rounded-pill bg-surface px-4 text-sm text-ink-faint lg:h-14 lg:px-5 lg:text-base"
            >
              <Search className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden />
              Search for a model
            </Link>
            <button
              type="button"
              onClick={() => setFilterSheetOpen(true)}
              aria-label={`Filters${filterCount > 0 ? `, ${filterCount} active` : ""}`}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-coral text-white shadow-button lg:h-14 lg:w-14"
            >
              <SlidersHorizontal className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden />
              {filterCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-white"
                  aria-hidden
                >
                  {filterCount}
                </span>
              )}
            </button>
          </div>

          {/* Solid offset shadow, not a blur — reads as a little raised
              button that visibly sinks (active:shadow-none + translate-y)
              on tap. */}
          <nav aria-label="Condition" className="flex gap-2.5 overflow-x-auto pt-6 lg:gap-3 lg:pt-4">
            {TIERS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, tier: t.value }))}
                aria-pressed={filters.tier === t.value}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-pill bg-canvas px-4 py-2 text-sm font-semibold transition-all duration-150 active:translate-y-[3px] active:shadow-none lg:gap-2 lg:px-5 lg:py-2.5 lg:text-base",
                  filters.tier === t.value ? "text-coral shadow-edge-coral" : "text-ink-muted shadow-edge",
                )}
              >
                <t.Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2} aria-hidden />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <FilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        value={filters}
        onApply={setFilters}
        category={category}
      />

      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3.5 px-6 lg:px-12 pt-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
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
          <p className="px-6 lg:px-12 pt-5 text-xs text-ink-faint lg:text-sm">{listings.length} shown</p>

          <ul className="grid grid-cols-2 gap-3.5 px-6 lg:px-12 pt-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {listings.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/listing/${l.reference}`}
                  className="group block transition-transform duration-150 active:scale-[0.97]"
                >
                  <div className="rounded-[26px] bg-canvas p-3 shadow-soft transition-shadow duration-150 group-active:shadow-none">
                    <div
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-[18px]",
                        HALO,
                      )}
                    >
                      {/* cover, not contain — real seller photos aren't
                          isolated cutouts, so "contain" was leaving letterbox
                          gaps that exposed the halo colour behind them. */}
                      <div className="h-full w-full transition-transform duration-300 group-active:scale-110">
                        <DevicePhoto
                          category={l.category}
                          photo={l.photos?.[0]}
                          alt={l.title}
                          fit="cover"
                        />
                      </div>
                      <CornerTab tier={l.tier} />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          onToggleSave(l.id);
                        }}
                        aria-label={wishlist.isSaved(l.id) ? "Remove from saved" : "Save this listing"}
                        aria-pressed={wishlist.isSaved(l.id)}
                        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center"
                      >
                        <Heart
                          className={cn(
                            "h-[18px] w-[18px] drop-shadow",
                            wishlist.isSaved(l.id) ? "fill-coral text-coral" : "text-white",
                          )}
                          aria-hidden
                        />
                      </button>
                    </div>
                    <p className="mt-3 truncate text-[13px] font-bold text-ink lg:text-sm">{l.title}</p>
                    <PricePill className="mt-2">{l.price.display}</PricePill>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {query.hasNextPage && (
            <div className="px-6 lg:px-12 pt-6">
              <Button
                block
                variant="outline"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
                className="lg:mx-auto lg:block lg:w-64"
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

// useSearchParams (tier/category from the URL) opts the tree into
// client-side rendering unless it sits under its own Suspense boundary —
// without this, `next build` fails to prerender the page at all.
export default function BrowsePage() {
  return (
    <Suspense fallback={null}>
      <BrowseContent />
    </Suspense>
  );
}
