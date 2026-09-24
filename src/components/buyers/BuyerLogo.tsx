/**
 * A buyer's company logo, above their name on the buyer pages (2026-09-24).
 * Fitted, never cropped, on a white tile with a hairline, so a logo drawn on
 * transparency reads the same on any surface behind it.
 */
export function BuyerLogo({ url, name }: { url: string; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a same-origin, versioned route; next/image adds nothing here
    <img
      src={url}
      alt={`${name} logo`}
      className="h-16 w-auto max-w-48 rounded-md border border-hairline bg-canvas object-contain p-xs"
    />
  );
}
