"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { IMAGE_ACCEPT_ATTRIBUTE } from "@/lib/validation/product-images";

/**
 * A slim sibling of `src/components/upload/Dropzone.tsx`: the same drop /
 * browse funnel, different copy and `accept`. Kept separate rather than
 * generalised — that one carries PO-specific copy and a camera affordance
 * whose reason (photographing a document on site) does not apply here.
 */
export function ImageDropzone({
  onFiles,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (!list || disabled) return;
    const files = Array.from(list);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
      className={`rounded-md border border-dashed p-md text-center transition-colors ${
        over ? "border-focus bg-surface" : "border-hairline-strong bg-canvas"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <ImagePlus className="mx-auto size-5 text-ink-tertiary" aria-hidden />
      <p className="mt-xxs text-[length:var(--text-body-sm)] text-ink">
        Drop images here
      </p>
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        PNG, JPG or WebP up to 5 MB
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="mt-xs min-h-control-md rounded-sm px-xs text-[length:var(--text-body-sm)] text-brand-link hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-disabled sm:min-h-control-sm"
      >
        Choose files
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={IMAGE_ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // Cleared so choosing the same file twice fires change again.
          event.target.value = "";
        }}
      />
    </div>
  );
}
