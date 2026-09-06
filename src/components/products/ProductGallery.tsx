"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * One `<img>` that reports its own failure.
 *
 * `onError` alone is not enough, the same way it was not enough on the catalog
 * card. The browser starts loading while the server HTML is still being
 * parsed, so an image that fails fast has already errored before React
 * hydrates and attaches the handler; the event is never replayed and the
 * broken-image icon stays. A finished load with no intrinsic width is that
 * case. Without this check the 2026-09-06 review saw a large hero holding
 * nothing but its own alt text, and thumbnails that were grey boxes.
 */
function GalleryImage({
  src,
  alt,
  className,
  onFail,
}: {
  src: string;
  alt: string;
  className: string;
  onFail: () => void;
}) {
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const node = image.current;
    if (node?.complete && node.naturalWidth === 0) onFail();
    // `src` alone: one check per image, when it is first shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    /* A presigned R2 URL is host-specific and short-lived, so it cannot be a
       configured next/image remote pattern. */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={src}
      alt={alt}
      onError={onFail}
      className={className}
    />
  );
}

/**
 * With no usable image the empty state says what the reader can do about it —
 * and says which of the two problems this is. A product with no photo and a
 * product whose photo is missing from the bucket are different things, and
 * only the second is worth telling a super admin about (brief §8).
 */
export function ProductGallery({
  images,
  productName,
  canEdit,
}: {
  images: { id: string; url: string | null; position: number }[];
  productName: string;
  canEdit: boolean;
}) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const usable = images.filter((image) => image.url && !broken.has(image.id));
  const [selected, setSelected] = useState(0);

  const fail = (id: string) =>
    setBroken((current) =>
      // Same Set back when nothing changed, so a repeated report cannot spin
      // this into another render.
      current.has(id) ? current : new Set(current).add(id),
    );

  if (usable.length === 0) {
    /** Images on record but none of them usable: they exist and will not load. */
    const unavailable = images.length > 0;
    return (
      <section className="flex aspect-4/3 flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-hairline-strong bg-surface p-lg text-center">
        <ImageOff className="size-8 text-ink-disabled" strokeWidth={1.5} aria-hidden />
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {unavailable ? "Image unavailable" : canEdit ? "Add images" : "No images yet"}
        </p>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {unavailable
            ? canEdit
              ? "The file could not be loaded — replace it from Edit product"
              : "The file could not be loaded — ask a super admin"
            : canEdit
              ? "PNG, JPG or WebP up to 5 MB"
              : "Ask a super admin to add one"}
        </p>
      </section>
    );
  }

  const current = usable[Math.min(selected, usable.length - 1)];

  return (
    <section>
      <div className="relative aspect-4/3 overflow-hidden rounded-lg bg-surface-soft">
        <GalleryImage
          key={current.id}
          src={current.url!}
          alt={productName}
          onFail={() => fail(current.id)}
          className="size-full object-cover"
        />
        {usable.length > 1 ? (
          <span className="absolute right-xs top-xs rounded-full bg-ink px-sm py-xxs text-[length:var(--text-caption)] text-canvas">
            {Math.min(selected, usable.length - 1) + 1} / {usable.length}
          </span>
        ) : null}
      </div>

      {usable.length > 1 ? (
        <ul className="mt-sm flex flex-wrap gap-xs">
          {usable.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                aria-label={`Image ${index + 1} of ${usable.length}`}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={`size-16 overflow-hidden rounded-sm bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  index === selected ? "ring-2 ring-ink" : ""
                }`}
              >
                {/* A thumbnail that will not load leaves the strip rather than
                    sitting there as an empty tile. */}
                <GalleryImage
                  src={image.url!}
                  alt=""
                  onFail={() => fail(image.id)}
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
