"use client";

import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { ImageDropzone } from "@/components/products/ImageDropzone";
import { Spinner } from "@/components/portal/Spinner";
import type { ImageRow } from "@/hooks/useImageUploadQueue";
import { MAX_IMAGES_PER_PRODUCT } from "@/lib/validation/product-images";

export type StagedImage = { id: string; name: string; url: string };

const STATUS_LABEL: Record<ImageRow["status"], string> = {
  queued: "Waiting",
  uploading: "Uploading",
  processing: "Processing",
  done: "Added",
  failed: "Failed",
};

/**
 * The pictures a product will have, before the product exists.
 *
 * `/products/new` cannot upload anything as it goes: presign writes
 * `ProductImage` rows against a `productId`, and there is no product until the
 * form is submitted. So the files are held here — previewed from object URLs,
 * ordered, cover first — and uploaded in one pass the moment the row is
 * written.
 *
 * The tiles are deliberately the same object as `ProductImageManager`'s, minus
 * "Make cover": with at most a handful of files and the arrows right there,
 * moving one to the front is two clicks, and a third control per tile at 390px
 * costs more than it gives.
 */
export function StagedImages({
  staged,
  rows,
  rejected,
  busy,
  note = "At least one image is required. The first is the cover.",
  onFiles,
  onMove,
  onRemove,
}: {
  staged: StagedImage[];
  /** Live upload state, one per staged file in the same order. Empty until submit. */
  rows: ImageRow[];
  rejected: { name: string; reason: string }[];
  busy: boolean;
  /**
   * The sentence under the dropzone, which defaults to Phase 27's rule for the
   * shared panel. A variant row's own set is optional — the shared pictures
   * cover a row that stages none — so that panel says so instead, rather than
   * printing a requirement that is not true of it.
   */
  note?: string;
  onFiles: (files: File[]) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
}) {
  const full = staged.length >= MAX_IMAGES_PER_PRODUCT;

  return (
    <section className="flex flex-col gap-xs self-start rounded-lg border border-hairline bg-canvas p-md">
      <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Images
      </h2>

      {staged.length > 0 ? (
        <ul className="grid grid-cols-2 gap-xs sm:grid-cols-3">
          {staged.map((image, index) => {
            const row = rows[index];
            return (
              <li key={image.id}>
                <div className="relative aspect-square overflow-hidden rounded-sm bg-surface-soft">
                  {/* A blob: URL from this very browser — `next/image` would
                      only add a loader in front of a file it cannot fetch. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt=""
                    className="size-full object-cover"
                  />
                  {row && row.status !== "done" && row.status !== "failed" ? (
                    <span className="absolute inset-0 grid place-items-center bg-canvas/70">
                      <Spinner />
                    </span>
                  ) : null}
                  {index === 0 ? (
                    <span className="absolute left-0 top-0 rounded-br-sm bg-ink px-xxs text-[length:var(--text-caption)] text-canvas">
                      Cover
                    </span>
                  ) : null}
                </div>
                <p
                  className="mt-xxs truncate text-[length:var(--text-caption)] text-ink-tertiary"
                  title={image.name}
                >
                  {row
                    ? (row.reason ?? STATUS_LABEL[row.status])
                    : image.name}
                </p>
                <div className="flex items-center justify-center gap-xxs">
                  <TileButton
                    label={`Move image ${index + 1} earlier`}
                    disabled={index === 0 || busy}
                    onClick={() => onMove(index, -1)}
                  >
                    <ArrowLeft className="size-3.5" aria-hidden />
                  </TileButton>
                  <TileButton
                    label={`Move image ${index + 1} later`}
                    disabled={index === staged.length - 1 || busy}
                    onClick={() => onMove(index, 1)}
                  >
                    <ArrowRight className="size-3.5" aria-hidden />
                  </TileButton>
                  <TileButton
                    label={`Remove image ${index + 1}`}
                    disabled={busy}
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </TileButton>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {full ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {`That is ${MAX_IMAGES_PER_PRODUCT} images — remove one to add another.`}
        </p>
      ) : (
        <ImageDropzone disabled={busy} onFiles={onFiles} />
      )}

      {rejected.length > 0 ? (
        <ul className="flex flex-col gap-xxs" aria-live="polite">
          {rejected.map((entry) => (
            <li
              key={`${entry.name}-${entry.reason}`}
              className="flex items-center gap-xs text-[length:var(--text-caption)]"
            >
              <span className="min-w-0 flex-1 truncate text-ink" title={entry.name}>
                {entry.name}
              </span>
              <span className="text-accent-red">{entry.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-[length:var(--text-caption)] text-ink-tertiary">{note}</p>
    </section>
  );
}

function TileButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-disabled sm:size-7"
    >
      {children}
    </button>
  );
}
