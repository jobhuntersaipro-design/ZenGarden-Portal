import Image from "next/image";

/**
 * The Zen Garden logo: the customer's full flower badge, everywhere
 * (2026-09-24).
 *
 * It first went out as two cuts — the badge where there was room, and the
 * green "zen GARDEN" oval alone in the bars and headers — and the user asked
 * for the flowers everywhere, so both components now draw the same badge and
 * differ only in the height they default to:
 *
 * - `Wordmark` at `h-logo-mark` (52px), for the portal sidebar, the phone top
 *   bar, the admin bar, the shop header, the 404 and the on-screen purchase
 *   order. It kept its name so its six callers did not have to change.
 * - `BrandBadge` at `h-logo-badge` (112px), for the auth card, the shop's
 *   opening band and its footer.
 *
 * The file is a transparent PNG cut from the customer's 728px JPG (the white
 * background flooded out from the border and un-mixed from the rim), so it
 * sits on `canvas`, `surface` or `surface-soft` without a white box. CSS sets
 * the height; the width follows the file's own ratio.
 *
 * The tab icon is deliberately *not* this badge: at 16px the flowers are a
 * smudge, so `src/app/icon.png` carries the word "zen" on its own.
 */
const BADGE = { src: "/brand/zen-garden-badge.png", width: 400, height: 390 };

export function BrandBadge({
  className = "h-logo-badge",
  alt = "Zen Garden — Luxury From Nature",
  loading = "eager",
}: {
  /** Carries the height token; the width follows the file's ratio. */
  className?: string;
  alt?: string;
  /** Eager by default — nearly every placement is at the top of a page. The
   *  shop footer passes `lazy`. */
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

/** The badge at bar height, for headers and navigation. */
export function Wordmark({ className = "h-logo-mark" }: { className?: string }) {
  return <BrandBadge className={className} alt="Zen Garden" />;
}
