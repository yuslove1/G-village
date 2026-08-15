"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Heart, Search, SearchX, X } from "lucide-react";
import { api } from "@/lib/api";
import { CornerTab, PricePill, Skeleton } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { useWishlist } from "@/lib/use-wishlist";
import { cn } from "@/lib/utils";

// Same four categories, same renders, same hrefs as the home page's shelf —
// this is the other place someone lands before they have typed anything,
// so it should offer the same shortcuts rather than a different set.
const categories = [
  { slug: "phone", label: "Phones", icon: "/icons/phone-3d.webp" },
  { slug: "laptop", label: "Laptops", icon: "/icons/laptop-3d.webp" },
  { slug: "wearable", label: "Wearables", icon: "/icons/wearable-3d.webp" },
  { slug: "audio", label: "Audio", icon: "/icons/audio-3d.webp" },
];

const HALO = "bg-cyan-soft";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wishlist = useWishlist();

  function onToggleSave(listingId: string) {
    if (!wishlist.isAuthenticated) {
      router.push("/login?next=/search");
      return;
    }
    wishlist.toggle(listingId);
  }

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.catalog.listings({ q: debounced, limit: 24 }),
    enabled: debounced.length > 0,
  });

  const listings = results.data?.listings ?? [];

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 px-6 pt-4 lg:px-12">
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div className="flex h-12 flex-1 items-center gap-3 rounded-pill border border-transparent bg-surface px-4 transition-colors focus-within:border-coral lg:h-14 lg:px-5">
          <Search className="h-5 w-5 shrink-0 text-ink-faint lg:h-6 lg:w-6" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search phones, laptops..."
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint lg:text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 text-ink-faint"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {debounced.length === 0 ? (
        <div className="px-6 pt-8 lg:px-12">
          <h2 className="text-[15px] font-bold text-ink lg:text-xl">Browse by category</h2>
          <ul className="mt-4 grid grid-cols-4 gap-3 lg:grid-cols-8">
            {categories.map(({ slug, label, icon }) => (
              <li key={slug}>
                <Link
                  href={`/browse?category=${slug}`}
                  className="block text-center transition-transform active:scale-95"
                >
                  <span className="relative flex aspect-square items-center justify-center rounded-[18px] bg-canvas shadow-soft">
                    <Image src={icon} alt="" fill className="object-contain p-4" sizes="80px" />
                  </span>
                  <span className="mt-2 block text-[11px] text-ink-muted lg:text-sm">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : results.isLoading ? (
        <div className="grid grid-cols-2 gap-3.5 px-6 pt-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:px-12">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-surface text-ink-faint">
            <SearchX className="h-9 w-9" aria-hidden />
          </div>
          <h2 className="font-display text-display-sm text-ink">No matches for &ldquo;{debounced}&rdquo;</h2>
          <p className="mt-2 max-w-xs text-sm text-ink-muted">
            Try a shorter search, or check the spelling of the brand or model.
          </p>
        </div>
      ) : (
        <>
          <p className="px-6 pt-6 text-xs text-ink-faint lg:px-12 lg:text-sm">
            {listings.length} result{listings.length === 1 ? "" : "s"} for &ldquo;{debounced}&rdquo;
          </p>

          <ul className="grid grid-cols-2 gap-3.5 px-6 pt-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:px-12">
            {listings.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/listing/${l.reference}`}
                  className="group block transition-transform duration-150 active:scale-[0.97]"
                >
                  <div className="rounded-[26px] bg-canvas p-3 shadow-soft transition-shadow duration-150 group-active:shadow-none">
                    <div className={cn("relative aspect-square overflow-hidden rounded-[18px]", HALO)}>
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
        </>
      )}
    </div>
  );
}
