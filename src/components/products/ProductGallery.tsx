"use client";

import { useState } from "react";

/**
 * With no usable image the empty state says what the reader can do about it:
 * "Add images" for a super admin, "No images yet" for everyone else.
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
    setBroken((current) => new Set(current).add(id));

  if (usable.length === 0) {
    return (
      <section className="flex aspect-4/3 flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-hairline-strong bg-surface p-lg text-center">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {canEdit ? "Add images" : "No images yet"}
        </p>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {canEdit
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
        {/* A presigned R2 URL cannot be a configured next/image remote pattern. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url!}
          alt={productName}
          onError={() => fail(current.id)}
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url!}
                  alt=""
                  onError={() => fail(image.id)}
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
