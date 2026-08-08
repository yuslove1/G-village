import Link from "next/link";
import { ArrowUpRight, Headphones, Laptop, MapPin, Search, Smartphone, Watch } from "lucide-react";
import { Card, TierBadge, VerifiedMark } from "@/components/ui";
import { DevicePhoto } from "@/components/device-photo";

const categories = [
  { slug: "phone", label: "Phones", Icon: Smartphone },
  { slug: "laptop", label: "Laptops", Icon: Laptop },
  { slug: "wearable", label: "Wearables", Icon: Watch },
  { slug: "audio", label: "Audio", Icon: Headphones },
];

const tiers = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "UK_USED", label: "UK used" },
  { value: "NG_USED", label: "Nigeria used" },
];

async function getFeatured() {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  try {
    const res = await fetch(`${base}/catalog/listings?limit=4`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.listings ?? [];
  } catch {
    // The homepage still renders without the API. A blank grid beats a crash.
    return [];
  }
}

export default async function HomePage() {
  const listings = await getFeatured();

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between px-6 pt-4">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <MapPin className="h-4 w-4" aria-hidden />
          Ikeja, Lagos
        </span>
        <Link
          href="/account"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-xs font-bold"
          aria-label="Your account"
        >
          AO
        </Link>
      </div>

      <h1 className="px-6 pt-6 font-display text-[1.75rem] leading-tight text-ink">
        Find your next
        <br />
        gadget<span className="text-teal">.</span>
      </h1>

      <div className="px-6 pt-5">
        <Link
          href="/search"
          className="flex h-12 items-center gap-3 rounded-pill bg-surface px-4 text-sm text-ink-faint"
        >
          <Search className="h-5 w-5" aria-hidden />
          Search phones, laptops...
        </Link>
      </div>

      <nav aria-label="Condition" className="flex gap-6 overflow-x-auto px-6 pt-7">
        {tiers.map((t, i) => (
          <Link
            key={t.label}
            href={t.value ? `/browse?tier=${t.value}` : "/browse"}
            className={
              i === 0
                ? "shrink-0 border-b-2 border-teal pb-2 text-sm font-bold text-ink"
                : "shrink-0 pb-2 text-sm text-ink-faint"
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="px-6 pt-5">
        <Link
          href="/sell"
          className="flex items-center gap-4 rounded-card bg-ink px-5 py-4 text-white transition-transform active:scale-[0.99]"
        >
          <span className="flex-1">
            <span className="block text-sm font-bold">Sell or trade in your gadget</span>
            <span className="mt-0.5 block text-xs text-white/60">
              Instant offer in under a minute
            </span>
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
            <ArrowUpRight className="h-4 w-4 text-ink" aria-hidden />
          </span>
        </Link>
      </div>

      <ul className="grid grid-cols-4 gap-3 px-6 pt-7">
        {categories.map(({ slug, label, Icon }) => (
          <li key={slug}>
            <Link href={`/browse?category=${slug}`} className="block text-center">
              <span className="flex aspect-square items-center justify-center rounded-[18px] bg-surface">
                <Icon className="h-6 w-6 text-ink" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="mt-2 block text-[11px] text-ink-muted">{label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between px-6 pt-8">
        <h2 className="text-[15px] font-bold text-ink">Popular near you</h2>
        <Link href="/browse" className="text-xs text-ink-muted">
          View all
        </Link>
      </div>

      {listings.length === 0 ? (
        <p className="px-6 pt-6 text-sm text-ink-muted">
          Nothing listed yet. Check back shortly.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3.5 px-6 pt-4">
          {listings.map((l: any) => (
            <li key={l.id}>
              <Link href={`/listing/${l.reference}`}>
                <Card className="overflow-hidden p-2">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-surface">
                    <DevicePhoto category={l.category} photo={l.photos?.[0]} alt={l.title} />
                    <span className="absolute left-2 top-2">
                      <TierBadge tier={l.tier} />
                    </span>
                  </div>
                  <div className="px-2 pb-2 pt-3">
                    <p className="truncate text-[13px] font-bold text-ink">{l.title}</p>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {l.grade ? `${l.grade.toLowerCase()} condition` : "Sealed"}
                    </p>
                    <p className="tabular mt-2 text-[15px] font-bold text-ink">{l.price.display}</p>
                    <div className="mt-1.5">
                      <VerifiedMark />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
