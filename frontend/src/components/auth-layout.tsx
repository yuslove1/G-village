import Image from "next/image";
import Link from "next/link";

// 3dicons.co, CC0 — same source and no-alpha-channel caveat as the home
// page's category renders (device-photo.tsx / page.tsx): these are baked
// onto an opaque light square, not a transparent cutout, so each needs its
// own canvas tile behind it rather than sitting directly on the dark photo.
const FEATURES = [
  { icon: "/icons/verified-3d.webp", label: "Verified before you pay" },
  { icon: "/icons/delivery-3d.webp", label: "Delivered nationwide" },
  { icon: "/icons/receipt-3d.webp", label: "Real receipt, every time" },
];

// The real place the whole app is named after — two shots from the same
// Wiki Loves Africa aerial series of the actual Computer Village market in
// Ikeja, Lagos, one per page so a visitor bouncing between login and signup
// (a real, common pattern — "wrong one, let me try the other") sees two
// different frames instead of a jarring identical repeat. A third option
// from the same search, a street-level shot, was rejected outright: a
// single vendor's storefront (TECNO) filled most of that frame, and the
// catalogue here spans Apple, Samsung, Tecno, HP and more — same
// brand-neutrality reasoning behind every image choice on this page.
// Wikimedia Commons, CC BY-SA 4.0 — unlike the Unsplash License used
// elsewhere in the app, this one requires attribution, hence the credit
// line rendered over each photo.
const HERO_BY_VARIANT = {
  login: {
    src: "https://upload.wikimedia.org/wikipedia/commons/9/92/Computer_Village_series_3%2C_Ikeja%2C_Lagos.jpg",
    credit: "Photo: Tosin Toromade, CC BY-SA 4.0",
  },
  signup: {
    src: "https://upload.wikimedia.org/wikipedia/commons/e/ed/Computer_Village_Series_2._Ikeja%2C_Lagos.jpg",
    credit: "Photo: Tosin Toromade, CC BY-SA 4.0",
  },
} as const;

/**
 * Wraps login/signup with a split-panel desktop treatment — a photo panel
 * with the same trust copy as /welcome, so the three pre-auth screens read
 * as one system, beside the actual form. Pure lg: addition: every class
 * here is lg:-scoped, so on mobile this renders as an invisible wrapper
 * around whatever the page already had — the existing back-arrow/
 * heading/bottom-link structure is untouched below that breakpoint.
 *
 * min-h below is deliberate, not decorative: login's form is two fields,
 * signup's is four, and without a shared floor the two pages render
 * noticeably different card heights — login ends up looking clipped next
 * to signup rather than like the same design system.
 */
export function AuthLayout({
  children,
  variant,
  toggleLabel,
  toggleCta,
  toggleHref,
}: {
  children: React.ReactNode;
  variant: keyof typeof HERO_BY_VARIANT;
  toggleLabel: string;
  toggleCta: string;
  toggleHref: string;
}) {
  const hero = HERO_BY_VARIANT[variant];

  return (
    <div className="lg:mx-auto lg:my-10 lg:flex lg:max-w-5xl lg:min-h-[640px] lg:overflow-hidden lg:rounded-card lg:shadow-soft">
      <div className="relative hidden shrink-0 flex-col justify-between overflow-hidden p-10 lg:flex lg:w-[42%]">
        <Image
          src={hero.src}
          alt=""
          fill
          priority
          className="object-cover"
          sizes="(min-width: 1024px) 480px, 0px"
        />
        {/* Heavier than a typical photo overlay — this one has colour and
            detail everywhere, no natural empty stretch to rest text on, so
            legibility here comes entirely from the tint. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/55 to-ink/60" aria-hidden />
        <p className="absolute bottom-2 right-3 text-[10px] text-white/45">{hero.credit}</p>

        <Link href="/" className="relative font-display text-xl text-white">
          Gadgetvillage<span className="text-coral">.</span>
        </Link>

        <div className="relative">
          <p className="font-display text-2xl leading-tight text-white">
            Computer Village,
            <br />
            at your doorstep<span className="text-coral">.</span>
          </p>
          <ul className="mt-6 space-y-3">
            {FEATURES.map(({ icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-white/90">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas shadow-soft">
                  <Image src={icon} alt="" fill className="object-contain p-1.5" sizes="36px" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="lg:flex lg:w-[58%] lg:flex-col lg:justify-center lg:bg-canvas lg:px-16 lg:py-10">
        <div className="hidden justify-end lg:flex">
          <span className="text-sm text-ink-muted">
            {toggleLabel}{" "}
            <Link href={toggleHref} className="font-bold text-coral">
              {toggleCta}
            </Link>
          </span>
        </div>

        {/* Centred rather than stretched to the panel's full width — a
            two-field form spanning the same width as a four-field one just
            to fill space reads as an oversized, half-empty screen rather
            than a compact, intentional one. */}
        <div className="lg:mx-auto lg:w-full lg:max-w-sm">{children}</div>
      </div>
    </div>
  );
}
