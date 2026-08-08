import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Real photo when there is one, drawn silhouette when there is not.
 *
 * Most listings in the first months will come from a phone camera in a shop
 * in Ikeja, and some of them will have no usable image at all. A grey box with
 * a broken-image icon makes the whole catalogue look abandoned, so the
 * fallback is a proper device shape on the same warm surface the photos sit
 * on. The grid stays coherent whether or not the photo arrived.
 */

function PhoneShape() {
  return (
    <svg viewBox="0 0 64 128" className="h-[62%] w-auto" role="presentation">
      <rect width="64" height="128" rx="12" fill="#DEDBD2" />
      <rect x="4" y="4" width="56" height="120" rx="9" fill="#262624" />
      <rect x="21" y="10" width="22" height="6.5" rx="3.2" fill="#DEDBD2" />
      <rect x="14" y="56" width="32" height="3" rx="1.5" fill="#3A3A37" />
      <rect x="14" y="66" width="20" height="3" rx="1.5" fill="#33332F" />
    </svg>
  );
}

function LaptopShape() {
  return (
    <svg viewBox="0 0 144 96" className="w-[74%]" role="presentation">
      <rect x="12" y="8" width="120" height="74" rx="6" fill="#DEDBD2" />
      <rect x="16" y="12" width="112" height="66" rx="3" fill="#262624" />
      <rect x="0" y="82" width="144" height="7" rx="3.5" fill="#DEDBD2" />
      <rect x="58" y="82" width="28" height="3.5" rx="1.75" fill="#C6C3B8" />
    </svg>
  );
}

function WatchShape() {
  return (
    <svg viewBox="0 0 64 96" className="h-[62%] w-auto" role="presentation">
      <rect x="16" y="4" width="32" height="22" rx="8" fill="#DEDBD2" />
      <rect x="16" y="70" width="32" height="22" rx="8" fill="#DEDBD2" />
      <rect x="11" y="30" width="42" height="36" rx="10" fill="#262624" />
      <rect x="15" y="34" width="34" height="28" rx="7" fill="#33332F" />
    </svg>
  );
}

export function DevicePhoto({
  category,
  photo,
  alt,
  className,
}: {
  category?: string;
  photo?: string | null;
  alt: string;
  className?: string;
}) {
  if (photo) {
    return (
      <Image
        src={photo}
        alt={alt}
        fill
        sizes="(max-width: 512px) 45vw, 220px"
        className={cn("object-cover", className)}
      />
    );
  }

  const Shape =
    category === "laptop" ? LaptopShape : category === "wearable" ? WatchShape : PhoneShape;

  return (
    <span
      className={cn("absolute inset-0 flex items-center justify-center", className)}
      aria-hidden
    >
      <Shape />
    </span>
  );
}
