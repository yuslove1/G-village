"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { CornerTab, EmptyState, PageHeading, PricePill, Skeleton, Button } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";
import { useWishlist } from "@/lib/use-wishlist";
import { useAuth } from "@/lib/auth-store";

const HALO = "bg-cyan-soft";

export default function WishlistPage() {
  const { status } = useAuth();
  const { items, isLoading, toggle } = useWishlist();

  if (status === "idle" || status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-3.5 px-6 pt-6 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-[3/4]" />
        ))}
      </div>
    );
  }

  if (status === "guest") {
    return (
      <EmptyState
        icon={<Heart className="h-9 w-9" />}
        title="You're not signed in"
        description="Log in to save devices and keep track of them here."
        action={
          <Button asChild>
            <Link href="/login?next=/wishlist">Log in</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="animate-fade-up lg:mx-auto lg:max-w-6xl">
      <PageHeading sub={items.length > 0 ? `${items.length} item${items.length === 1 ? "" : "s"}` : undefined}>
        Saved
      </PageHeading>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3.5 px-6 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Heart className="h-9 w-9" />}
          title="Nothing saved yet"
          description="Tap the heart on any device to keep track of it here."
          action={
            <Button asChild>
              <Link href="/browse">Browse gadgets</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3.5 px-6 sm:grid-cols-3 lg:grid-cols-4">
          {items.map(({ listing }) => (
            <li key={listing.id}>
              <Link
                href={`/listing/${listing.reference}`}
                className="group block transition-transform duration-150 active:scale-[0.97]"
              >
                <div className="rounded-[26px] bg-canvas p-3 shadow-soft transition-shadow duration-150 group-active:shadow-none">
                  <div className={`relative aspect-square overflow-hidden rounded-[18px] ${HALO}`}>
                    <div className="h-full w-full transition-transform duration-300 group-active:scale-110">
                      <DevicePhoto
                        category={listing.category}
                        photo={listing.photos?.[0]}
                        alt={listing.title}
                        fit="cover"
                      />
                    </div>
                    <CornerTab tier={listing.tier} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggle(listing.id);
                      }}
                      aria-label="Remove from saved"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center"
                    >
                      <Heart className="h-[18px] w-[18px] fill-coral text-coral drop-shadow" aria-hidden />
                    </button>
                  </div>
                  <p className="mt-3 truncate text-[13px] font-bold text-ink lg:text-sm">{listing.title}</p>
                  <PricePill className="mt-2">{listing.price.display}</PricePill>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
