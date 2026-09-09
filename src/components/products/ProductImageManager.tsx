"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ImageDropzone } from "@/components/products/ImageDropzone";
import { Spinner } from "@/components/portal/Spinner";
import { useImageUploadQueue } from "@/hooks/useImageUploadQueue";
import { deleteImage, reorderImages } from "@/actions/products";
import { MAX_IMAGES_PER_PRODUCT } from "@/lib/validation/product-images";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";

type ManagedImage = { id: string; url: string | null; position: number };

const STATUS_LABEL: Record<string, string> = {
  queued: "Waiting",
  uploading: "Uploading",
  processing: "Processing",
  done: "Added",
  failed: "Failed",
};

/**
 * Super-admin only, beside the gallery on the product page — reached from the
 * empty state that has advertised this feature since Phase 08 ("Add images ·
 * PNG, JPG or WebP up to 5 MB") without it existing.
 *
 * Reordering is arrow buttons, not drag: `@dnd-kit` is named in the master
 * spec's dependency table and is not in package.json, and buttons are
 * keyboard-accessible without the parallel affordance a drag implementation
 * would still have to grow.
 */
export function ProductImageManager({
  productId,
  images,
}: {
  productId: string;
  images: ManagedImage[];
}) {
  const refresh = useAwaitableRefresh();
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const { rows, add, clear } = useImageUploadQueue(productId, () => {
    startTransition(() => {
      void refresh();
    });
  });

  const ordered = [...images].sort((a, b) => a.position - b.position);
  const full = ordered.length >= MAX_IMAGES_PER_PRODUCT;

  const move = async (id: string, delta: number) => {
    const ids = ordered.map((image) => image.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setWorking(id);
    const result = await reorderImages(productId, ids);
    setWorking(null);
    if (!result.success) toast.error(result.error);
    else await refresh();
  };

  const remove = async (id: string) => {
    setWorking(id);
    const result = await deleteImage(id);
    setWorking(null);
    if (!result.success) toast.error(result.error);
    else await refresh();
  };

  return (
    <section className="mt-md self-start rounded-lg border border-hairline bg-canvas p-md">
      <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Images
      </h2>

      {ordered.length > 0 ? (
        <ul className="mt-xs grid grid-cols-3 gap-xs sm:grid-cols-4">
          {ordered.map((image, index) => (
            <li key={image.id} className="relative">
              <div className="relative aspect-square overflow-hidden rounded-sm bg-surface-soft">
                {image.url ? (
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
                {working === image.id ? (
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
              <div className="mt-xxs flex items-center justify-center gap-xxs">
                <IconButton
                  label={`Move image ${index + 1} earlier`}
                  disabled={index === 0 || Boolean(working)}
                  onClick={() => void move(image.id, -1)}
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Make image ${index + 1} the cover`}
                  disabled={index === 0 || Boolean(working)}
                  onClick={() => void move(image.id, -index)}
                >
                  <Star className="size-3.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Move image ${index + 1} later`}
                  disabled={index === ordered.length - 1 || Boolean(working)}
                  onClick={() => void move(image.id, 1)}
                >
                  <ArrowRight className="size-3.5" aria-hidden />
                </IconButton>
                <IconButton
                  label={`Remove image ${index + 1}`}
                  disabled={Boolean(working)}
                  onClick={() => void remove(image.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-xs">
        {full ? (
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {`That is ${MAX_IMAGES_PER_PRODUCT} images — remove one to add another.`}
          </p>
        ) : (
          <ImageDropzone
            disabled={pending}
            onFiles={(files) => void add(files, ordered.length)}
          />
        )}
      </div>

      {rows.length > 0 ? (
        <ul className="mt-xs flex flex-col gap-xxs" aria-live="polite">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-xs text-[length:var(--text-caption)]"
            >
              <span className="min-w-0 flex-1 truncate text-ink" title={row.name}>
                {row.name}
              </span>
              <span
                className={
                  row.status === "failed" ? "text-accent-red" : "text-ink-tertiary"
                }
              >
                {row.reason ?? STATUS_LABEL[row.status]}
              </span>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={clear}
              className="text-[length:var(--text-caption)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Clear list
            </button>
          </li>
        </ul>
      ) : null}
    </section>
  );
}

function IconButton({
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
      className="grid size-7 place-items-center rounded-sm text-ink-secondary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-disabled"
    >
      {children}
    </button>
  );
}
