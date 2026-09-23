"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { initials } from "@/lib/avatar";

/**
 * Falls back to the initials tile when the image will not load. A presigned
 * URL can expire, and the object can be missing entirely — a broken-image icon
 * is worse than no image, because it reads as the page being broken rather
 * than the product lacking a photo.
 *
 * `fallback` replaces the initials for a caller whose subject is not a
 * product — the shop's category tiles draw their own mark there. It is a prop
 * rather than a second component because what is worth sharing is the effect
 * below, which took a shipped defect to find.
 */
export function ProductThumb({
  name,
  url,
  fallback,
}: {
  name: string;
  url: string | null;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  /**
   * `onError` alone is not enough. The browser starts loading during SSR HTML
   * parsing, so an image that fails fast has already errored before React
   * hydrates and attaches the handler — the event is never replayed, and the
   * broken icon stays. A finished load with no intrinsic width is that case.
   */
  useEffect(() => {
    const node = image.current;
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  if (!url || failed) {
    if (fallback !== undefined) return <>{fallback}</>;
    return (
      <span className="flex size-full items-center justify-center bg-canvas font-display text-[length:var(--text-display-md)] font-[650] text-ink-disabled">
        {initials(name)}
      </span>
    );
  }

  return (
    /* A presigned R2 URL is host-specific and short-lived, so it cannot be a
       configured next/image remote pattern. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="size-full object-cover"
    />
  );
}
