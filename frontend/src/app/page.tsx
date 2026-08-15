import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Flag,
  LayoutGrid,
  MapPin,
  Plane,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { CornerTab, PricePill, VerifiedMark } from "@/components/ui";
import { AccountAvatar } from "@/components/account-avatar";
import { DevicePhoto } from "@/components/device-photo";
import { HotCarousel } from "@/components/hot-carousel";
import { cn } from "@/lib/utils";

// 3D renders (3dicons.co, CC0 — free for commercial use, no attribution
// required) instead of flat line icons here on purpose: this grid is the
// first thing on the page and reads as a shelf of actual objects rather
// than a settings menu. "clock" stands in for wearables — 3dicons' free set
// has no dedicated watch render, and a clock face reads the same way at
// this size.
const categories = [
  { slug: "phone", label: "Phones", icon: "/icons/phone-3d.webp" },
  { slug: "laptop", label: "Laptops", icon: "/icons/laptop-3d.webp" },
  { slug: "wearable", label: "Wearables", icon: "/icons/wearable-3d.webp" },
  { slug: "audio", label: "Audio", icon: "/icons/audio-3d.webp" },
];

// One accent, not a rotating rainbow — rotating tints kept reading as
// noisy no matter how muted the individual colours were. Cyan-soft is
// coral's complement, so the warm badges and buttons sitting on it pop
// instead of fighting it.
const HALO = "bg-cyan-soft";

// Uneven aspect ratios per card so the masonry columns actually stagger
// instead of quietly reproducing a uniform grid.
const aspects = ["aspect-[4/5]", "aspect-square", "aspect-[5/6]", "aspect-[4/5]"];

// Distinct from icons used elsewhere on the page — the "All" chip used to
// share Grid2x2 with the Browse nav tab, and "Nigeria used" shared MapPin
// with the location badge above, so both read as pointing at the wrong
// thing at a glance.
const tiers = [
  { value: "", label: "All", Icon: LayoutGrid },
  { value: "NEW", label: "New", Icon: Sparkles },
  { value: "UK_USED", label: "UK used", Icon: Plane },
  { value: "NG_USED", label: "Nigeria used", Icon: Flag },
];

async function getListings(params: string) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  try {
    const res = await fetch(`${base}/catalog/listings?${params}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.listings ?? [];
  } catch {
    // The homepage still renders without the API. A blank page beats a crash.
    return [];
  }
}

export default async function HomePage() {
  // 4 was plenty for a single mobile column; at lg: the popular grid runs
  // 4 columns wide, so 4 items reduces to one sparse row with the rest of
  // the section empty. More headroom here, not a breakpoint-specific fetch.
  const [listings, freshListings] = await Promise.all([
    getListings("limit=12"),
    getListings("tier=NEW&limit=6"),
  ]);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between px-6 lg:px-12 pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted lg:text-sm">
          <MapPin className="h-4 w-4 lg:h-5 lg:w-5" aria-hidden />
          Ikeja, Lagos
        </span>
        {/* TopNav carries its own account avatar at this width. */}
        <AccountAvatar className="lg:hidden" />
      </div>

      {/* Heading left, search+chips right, sharing one row at lg: — stacked
          full-width like on mobile just left a tall narrow column with the
          right two-thirds of the page empty. text-sm/h-12 sizing throughout
          also needs its own lg: scale, not just more room around it. */}
      <div className="px-6 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-12">
        <h1 className="pt-6 font-display text-[1.75rem] leading-tight text-ink lg:shrink-0 lg:pt-0 lg:text-5xl">
          Find your next
          <br />
          gadget<span className="text-coral">.</span>
        </h1>

        <div className="lg:w-full lg:max-w-xl">
          <div className="flex items-center gap-3 pt-5 lg:pt-0">
            <Link
              href="/search"
              className="flex h-12 flex-1 items-center gap-3 rounded-pill bg-surface px-4 text-sm text-ink-faint lg:h-14 lg:px-5 lg:text-base"
            >
              <Search className="h-5 w-5 lg:h-6 lg:w-6" aria-hidden />
              Search phones, laptops...
            </Link>
            <Link
              href="/browse"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-pill bg-coral text-white shadow-button lg:h-14 lg:w-14"
              aria-label="Filters"
            >
              <SlidersHorizontal className="h-4.5 w-4.5 lg:h-5 lg:w-5" aria-hidden />
            </Link>
          </div>

          {/* A solid offset shadow instead of a blur — the chip reads as a
              little raised button, and active:shadow-none + translate-y
              makes it visibly sink into that gap on tap, like a real button
              being pressed rather than just a colour change. */}
          <nav aria-label="Condition" className="flex gap-2.5 overflow-x-auto pt-7 lg:gap-3 lg:pt-4">
            {tiers.map((t, i) => (
              <Link
                key={t.label}
                href={t.value ? `/browse?tier=${t.value}` : "/browse"}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-pill bg-canvas px-4 py-2 text-sm font-semibold transition-all duration-150 active:translate-y-[3px] active:shadow-none lg:gap-2 lg:px-5 lg:py-2.5 lg:text-base",
                  i === 0 ? "text-coral shadow-edge-coral" : "text-ink-muted shadow-edge",
                )}
              >
                <t.Icon className="h-3.5 w-3.5 lg:h-4 lg:w-4" strokeWidth={2} aria-hidden />
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {freshListings.length > 0 && (
        <div className="pt-7 lg:pt-10">
          <div className="flex items-baseline justify-between px-6 lg:px-12">
            <h2 className="text-[15px] font-bold text-ink lg:text-xl">Hot right now</h2>
            <Link href="/browse?tier=NEW" className="text-xs text-ink-muted lg:text-sm">
              View all
            </Link>
          </div>
          <div className="pt-4 lg:pt-5">
            <HotCarousel listings={freshListings} />
          </div>
        </div>
      )}

      {/* Side by side at lg: instead of two separate full-width rows each
          capped narrow — that left a dead strip next to both of them. A
          promo banner and four tiles sharing one row is what actually uses
          a wide container instead of just sitting inside it. */}
      <div className="px-6 lg:px-12 pt-5 lg:flex lg:items-stretch lg:gap-6 lg:pt-8">
        <Link
          href="/sell"
          className="relative flex items-center gap-4 overflow-hidden rounded-card bg-gradient-to-br from-cyan-dark to-cyan px-5 py-4 text-white shadow-soft transition-transform active:scale-[0.99] lg:flex-1 lg:px-8 lg:py-6"
        >
          <span
            className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-white/10"
            aria-hidden
          />
          <span className="relative flex-1">
            <span className="block text-sm font-bold lg:text-lg">Sell or trade in your gadget</span>
            <span className="mt-0.5 block text-xs text-white/75 lg:mt-1 lg:text-sm">
              Instant offer in under a minute
            </span>
          </span>
          {/* Coral even here, on a cool banner — it's the one colour in the
              app that always means "tap this," so it doesn't sit out just
              because the surface underneath it is cyan. */}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-coral shadow-button lg:h-11 lg:w-11">
            <ArrowUpRight className="h-4 w-4 text-white lg:h-5 lg:w-5" aria-hidden />
          </span>
        </Link>

        <ul className="mt-7 grid grid-cols-4 gap-3 lg:mt-0 lg:w-[320px] lg:shrink-0 lg:grid-cols-2 lg:grid-rows-2 lg:gap-3">
          {categories.map(({ slug, label, icon }) => (
            <li key={slug}>
              <Link
                href={`/browse?category=${slug}`}
                className="block text-center transition-transform active:scale-95"
              >
                {/* These renders are baked-in opaque squares (checked: no
                    alpha channel), not transparent icon assets — a colour
                    halo behind one just shows as a mismatched white box. A
                    plain white tile is what they're actually designed to sit
                    on, same shadow language as the rest of the app's cards. */}
                <span className="relative flex aspect-square items-center justify-center rounded-[18px] bg-canvas shadow-soft lg:aspect-auto lg:h-[68px]">
                  <Image src={icon} alt="" fill className="object-contain p-4 lg:p-3" sizes="80px" />
                </span>
                <span className="mt-2 block text-[11px] text-ink-muted lg:text-sm">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-baseline justify-between px-6 lg:px-12 pt-8 lg:pt-12">
        <h2 className="text-[15px] font-bold text-ink lg:text-xl">Popular near you</h2>
        <Link href="/browse" className="text-xs text-ink-muted lg:text-sm">
          View all
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="px-6 lg:px-12 pt-6 text-sm text-ink-muted">
          Nothing listed yet. Check back shortly.
        </p>
      ) : (
        <ul className="columns-2 gap-3.5 px-6 lg:px-12 pt-4 sm:columns-3 lg:columns-4">
          {listings.map((l: any, i: number) => (
            <li key={l.id} className="mb-3.5 break-inside-avoid">
              <Link
                href={`/listing/${l.reference}`}
                className="group block transition-transform duration-150 active:scale-[0.97]"
              >
                <div className="rounded-card bg-canvas p-3 shadow-soft transition-shadow duration-150 group-active:shadow-none">
                  <div
                    className={cn(
                      "relative overflow-hidden rounded-2xl",
                      aspects[i % aspects.length],
                      HALO,
                    )}
                  >
                    {/* cover, not contain — these are real seller/lifestyle
                        photos, not isolated product cutouts, so "contain"
                        left letterbox gaps that exposed the halo colour
                        underneath. Cover fills the tile; the halo now only
                        ever shows behind the vector fallback silhouette. */}
                    <div className="h-full w-full transition-transform duration-300 group-active:scale-110">
                      <DevicePhoto
                        category={l.category}
                        photo={l.photos?.[0]}
                        alt={l.title}
                        fit="cover"
                      />
                    </div>
                    <CornerTab tier={l.tier} />
                  </div>
                  <p className="mt-3 truncate text-[13px] font-bold text-ink lg:text-sm">{l.title}</p>
                  <PricePill className="mt-2">{l.price.display}</PricePill>
                  <div className="mt-1.5 lg:mt-2">
                    <VerifiedMark />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
