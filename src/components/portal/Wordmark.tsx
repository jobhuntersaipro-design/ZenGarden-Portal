import Image from "next/image";

/**
 * The Zen Garden logo, in the two cuts `public/brand` holds (2026-09-24).
 *
 * `Wordmark` is the green oval alone — "zen GARDEN" on its own, for the
 * portal sidebar, the phone top bar, the admin bar, the shop header and the
 * 404. It replaced the gradient text mark rather than sitting beside it: a
 * purple word next to a green-and-pink badge reads as two brands.
 *
 * `BrandBadge` is the full watercolour badge, used only where it has room —
 * the auth card, the shop's opening band and its footer. Below about 100px
 * the flowers and "Luxury From Nature" turn to blur, which is why the bars
 * take the oval instead.
 *
 * Both files are transparent PNGs cut from the customer's 728px JPG (white
 * background removed, the oval masked against its cream frame), so either
 * sits on `canvas`, `surface` or `surface-soft` without a white box. The
 * intrinsic sizes below are those files'; CSS sets the height and the width
 * follows.
 */
const OVAL = { src: "/brand/zen-garden-oval.png", width: 379, height: 249 };
const BADGE = { src: "/brand/zen-garden-badge.png", width: 400, height: 390 };

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Image
      {...OVAL}
      alt="Zen Garden"
      sizes="128px"
      // Top of every page: loaded with the page, never lazily after it.
      loading="eager"
      className={`block h-logo-oval w-auto ${className}`}
    />
  );
}

export function BrandBadge({
  className = "h-logo-badge",
  alt = "Zen Garden — Luxury From Nature",
  loading = "eager",
}: {
  /** Carries the height token; the width follows the file's ratio. */
  className?: string;
  alt?: string;
  /** Eager by default — the auth card and the shop's opening band are the
   *  first thing on screen. The footer's passes `lazy`. */
  loading?: "eager" | "lazy";
}) {
  return (
    <Image
      {...BADGE}
      alt={alt}
      sizes="320px"
      loading={loading}
      className={`block w-auto ${className}`}
    />
  );
}
