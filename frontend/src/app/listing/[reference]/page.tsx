"use client";

import { useState, type UIEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BatteryMedium,
  Headphones,
  Heart,
  Laptop,
  PackageOpen,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  TriangleAlert,
  Watch,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Badge, Button, Card, EmptyState, PricePill, Skeleton, TierBadge, VerifiedMark } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { HotCarousel } from "@/components/hot-carousel";
import { useCart } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-store";
import { cn, relativeTime, TIER_LABEL } from "@/lib/utils";

const CATEGORY_ICON: Record<string, typeof Smartphone> = {
  phone: Smartphone,
  laptop: Laptop,
  wearable: Watch,
  audio: Headphones,
};

// Same severity-coded icons as the sell flow's condition step, so "Excellent"
// reads the same way whether you are pricing a trade-in or reading a listing.
const GRADE_ICON: Record<string, typeof Sparkles> = {
  MINT: Sparkles,
  EXCELLENT: ShieldCheck,
  GOOD: TriangleAlert,
  FAIR: XCircle,
};

const GRADE_TITLE: Record<string, string> = {
  MINT: "Flawless",
  EXCELLENT: "Light marks",
  GOOD: "Scratched",
  FAIR: "Cracked",
};

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-canvas p-3.5 shadow-soft">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-soft text-cyan-dark">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-ink-faint">{label}</span>
        <span className="block truncate text-sm font-bold text-ink">{value}</span>
      </span>
    </div>
  );
}

/**
 * One slide per photo, swipe-snapped with dots — same interaction as
 * HotCarousel's per-listing slides, just one listing's own photos instead
 * of a shelf of different ones. Falls back to the single drawn silhouette
 * when a listing has no photos at all.
 */
function Gallery({ photos, category, title }: { photos: string[]; category: string; title: string }) {
  const slides = photos.length > 0 ? photos : [null];
  const [active, setActive] = useState(0);

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="relative aspect-square bg-cyan-soft lg:aspect-[4/3]">
      <div onScroll={handleScroll} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto">
        {slides.map((photo, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-center">
            <DevicePhoto category={category} photo={photo} alt={title} fit="cover" />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
          {slides.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full shadow-soft transition-all",
                i === active ? "w-4 bg-coral" : "w-1.5 bg-canvas/80",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ListingDetailPage() {
  const { reference } = useParams<{ reference: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCart();
  const { status: authStatus } = useAuth();

  const query = useQuery({
    queryKey: ["listing", reference],
    queryFn: () => api.catalog.listing(reference),
  });

  const listing = query.data?.listing;

  const related = useQuery({
    queryKey: ["listing", reference, "related"],
    queryFn: () => api.catalog.listings({ category: listing!.category, limit: 8 }),
    enabled: Boolean(listing),
  });

  // Fetched once per page rather than a per-listing "is this saved" call —
  // a wishlist is small enough that one list covers every product page a
  // session is likely to visit, at a fraction of the request count.
  const wishlist = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.wishlist.list(),
    enabled: authStatus === "authenticated",
  });

  const saved = Boolean(listing && wishlist.data?.wishlist.some((w) => w.listing.id === listing.id));

  const toggleWishlist = useMutation({
    mutationFn: async () => {
      if (saved) await api.wishlist.remove(listing!.id);
      else await api.wishlist.add(listing!.id);
    },
    onSuccess: () => {
      toast.success(saved ? "Removed from saved" : "Saved to your wishlist");
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not update your saved items");
    },
  });

  function onToggleSave() {
    if (authStatus === "guest") {
      router.push(`/login?next=/listing/${reference}`);
      return;
    }
    toggleWishlist.mutate();
  }

  // No server-side cart — order creation takes a flat item list directly, so
  // "add to cart" just means "remember this locally until checkout" (see
  // lib/cart-store.ts). Buy now is the same action plus an immediate jump to
  // checkout, not a separate purchase path.
  function addToCart() {
    if (!listing) return;
    cart.add({
      id: listing.id,
      reference: listing.reference,
      title: listing.title,
      category: listing.category,
      tier: listing.tier,
      price: listing.price,
      photo: listing.photos?.[0] ?? null,
    });
    toast.success("Added to cart");
  }

  function buyNow() {
    if (!listing) return;
    if (authStatus === "guest") {
      router.push(`/login?next=/checkout`);
      return;
    }
    addToCart();
    router.push("/checkout");
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: listing?.title, url });
      } catch {
        // Sheet dismissed — nothing to report.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  if (query.isLoading) {
    return (
      <div className="animate-fade-up">
        <div className="lg:mx-12 lg:mt-6 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <Skeleton className="aspect-square lg:aspect-[4/3] lg:rounded-card" />
          <div className="space-y-3 px-6 pt-5 lg:px-0">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (query.isError || !listing) {
    return (
      <EmptyState
        icon={<PackageOpen className="h-9 w-9" />}
        title="Listing not found"
        description="This one may have sold or been taken down. Have a look at what else is live."
        action={
          <Button asChild variant="outline">
            <Link href="/browse">Back to browse</Link>
          </Button>
        }
      />
    );
  }

  const CategoryIcon = CATEGORY_ICON[listing.category] ?? Smartphone;
  const GradeIcon = listing.grade ? GRADE_ICON[listing.grade] : null;
  const relatedListings = (related.data?.listings ?? []).filter((l) => l.id !== listing.id);
  const specs = listing.specs as Record<string, unknown> | null;

  return (
    <div className="animate-fade-up">
      <div className="relative lg:mx-12 lg:mt-6 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-10">
        <div className="relative lg:overflow-hidden lg:rounded-card lg:shadow-soft">
          <Gallery photos={listing.photos} category={listing.category} title={listing.title} />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <Link
              href="/browse"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas/90 shadow-soft backdrop-blur"
              aria-label="Back"
            >
              <ArrowLeft className="h-4.5 w-4.5" aria-hidden />
            </Link>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={share}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas/90 shadow-soft backdrop-blur"
                aria-label="Share this listing"
              >
                <Share2 className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={onToggleSave}
                aria-pressed={saved}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas/90 shadow-soft backdrop-blur"
                aria-label="Save this listing"
              >
                <Heart className={cn("h-4 w-4", saved ? "fill-coral text-coral" : "text-ink")} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 pt-5 lg:sticky lg:top-24 lg:self-start lg:px-0 lg:pt-0">
          <div className="flex items-center gap-2">
            <TierBadge tier={listing.tier} />
            {!listing.inStock && <Badge tone="danger">Sold</Badge>}
          </div>

          <h1 className="mt-3 font-display text-display-md text-ink lg:text-display-lg">{listing.title}</h1>

          {listing.publishedAt && (
            <p className="mt-1 text-xs text-ink-faint">Listed {relativeTime(listing.publishedAt)}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <PricePill className="text-base lg:text-lg">{listing.price.display}</PricePill>
            {listing.saving && (
              <span className="text-xs font-semibold text-mint">Save {listing.saving.display} on new</span>
            )}
          </div>

          <div className="mt-3">
            {listing.verified ? (
              <VerifiedMark label="Verified by Gadgetvillage" />
            ) : (
              <span className="text-[11px] font-bold text-ink-faint lg:text-xs">Pending inspection</span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {listing.grade && GradeIcon && (
              <Stat
                icon={<GradeIcon className="h-4 w-4" strokeWidth={2} aria-hidden />}
                label="Condition"
                value={GRADE_TITLE[listing.grade] ?? listing.grade}
              />
            )}
            {listing.batteryHealth != null && (
              <Stat
                icon={<BatteryMedium className="h-4 w-4" strokeWidth={2} aria-hidden />}
                label="Battery health"
                value={`${listing.batteryHealth}%`}
              />
            )}
            <Stat
              icon={<CategoryIcon className="h-4 w-4" strokeWidth={2} aria-hidden />}
              label="Category"
              value={listing.category.charAt(0).toUpperCase() + listing.category.slice(1)}
            />
            <Stat
              icon={<Tag className="h-4 w-4" strokeWidth={2} aria-hidden />}
              label="Condition tier"
              value={TIER_LABEL[listing.tier] ?? listing.tier}
            />
          </div>

          {listing.verified && (
            <Card className="mt-5 flex gap-3 border-0 bg-mint-soft p-4">
              <ShieldCheck className="h-5 w-5 shrink-0 text-mint" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-muted">
                <span className="font-bold text-ink">Inspected in person.</span> Screen, battery, IMEI and
                iCloud status were all checked before this listing went live.
              </p>
            </Card>
          )}

          <section className="mt-6">
            <h2 className="text-sm font-bold text-ink">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {listing.description ?? "No description provided yet."}
            </p>
          </section>

          {specs && Object.keys(specs).length > 0 && (
            <section className="mt-6">
              <h2 className="text-sm font-bold text-ink">Specifications</h2>
              <dl className="mt-3 divide-y divide-hairline rounded-card bg-canvas shadow-soft">
                {Object.entries(specs).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <dt className="text-ink-muted capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</dt>
                    <dd className="truncate font-semibold text-ink">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="mt-7 flex gap-3 pb-2">
            <Button
              variant="outline"
              size="lg"
              disabled={!listing.inStock}
              onClick={addToCart}
              className="flex-1"
            >
              Add to cart
            </Button>
            <Button size="lg" disabled={!listing.inStock} onClick={buyNow} className="flex-1">
              {listing.inStock ? "Buy now" : "Sold out"}
            </Button>
          </div>
        </div>
      </div>

      {relatedListings.length > 0 && (
        <div className="pt-8 lg:pt-12">
          <h2 className="px-6 text-[15px] font-bold text-ink lg:px-12 lg:text-xl">You might also like</h2>
          <div className="pt-4 lg:pt-5">
            <HotCarousel listings={relatedListings} />
          </div>
        </div>
      )}
    </div>
  );
}
