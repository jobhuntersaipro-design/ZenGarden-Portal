"use client";

import { useEffect, useRef, useState } from "react";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * Falls back to the initials tile when the image will not load. A presigned
 * URL can expire, and the object can be missing entirely — a broken-image icon
 * is worse than no image, because it reads as the page being broken rather
 * than the product lacking a photo.
 */
export function ProductThumb({
  name,
  url,
}: {
  name: string;
  url: string | null;
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
