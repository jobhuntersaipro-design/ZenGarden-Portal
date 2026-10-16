"use client";

import { useState } from "react";
import { Download, Play, Trash2 } from "lucide-react";
import type { ContainerMediaKind } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type GalleryItem = {
  id: string;
  kind: ContainerMediaKind;
  originalName: string;
  /** Under the tile: who uploaded it (staff only; a buyer never sees a name). */
  by?: string;
  date: string;
};

/**
 * Photos and videos of one container, shared by the staff card and the
 * buyer's order (Phase 68). Every URL is `${base}/${id}/url`, a route that
 * checks access and answers a 302 to a ten-minute link, so no storage key
 * reaches the page.
 */
export function ContainerGallery({
  base,
  items,
  onDelete,
}: {
  base: string;
  items: GalleryItem[];
  onDelete?: (item: GalleryItem) => void;
}) {
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const url = (item: GalleryItem, query = "") => `${base}/${item.id}/url${query}`;
  return (
    <>
      <ul className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-col gap-xxs">
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen(item)}
                className="block aspect-square w-full overflow-hidden rounded-md border border-hairline bg-surface-soft focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`Open ${item.originalName}`}
              >
                {item.kind === "PHOTO" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a 302 to a presigned URL
                  <img src={url(item, "?thumb=1")} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full flex-col items-center justify-center gap-xs bg-ink px-xs text-canvas">
                    <Play aria-hidden className="size-8" />
                    <span className="max-w-full truncate text-[length:var(--text-caption)]">{item.originalName}</span>
                  </span>
                )}
              </button>
              {onDelete ? (
                <Button
                  variant="secondary"
                  className="absolute right-xxs top-xxs size-11 p-0 sm:size-8"
                  aria-label={`Delete ${item.originalName}`}
                  onClick={() => onDelete(item)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              ) : null}
            </div>
            <span className="flex min-w-0 flex-col text-[length:var(--text-caption)] text-ink-tertiary" title={item.originalName}>
              {item.by ? <span className="truncate">{item.by}</span> : null}
              <span>{item.date}</span>
            </span>
          </li>
        ))}
      </ul>
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-panel-xl">
          <SheetHeader>
            <SheetTitle className="truncate pr-lg">{open?.originalName}</SheetTitle>
            <SheetDescription>{open ? [open.by, open.date].filter(Boolean).join(" · ") : null}</SheetDescription>
          </SheetHeader>
          {open ? (
            <div className="flex min-w-0 flex-col gap-sm p-md pt-0">
              {open.kind === "PHOTO" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a 302 to a presigned URL
                <img src={url(open)} alt={open.originalName} className="w-full rounded-md" />
              ) : (
                <video key={open.id} src={url(open)} controls preload="metadata" className="w-full rounded-md bg-ink" />
              )}
              {open.kind === "VIDEO" ? (
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  If it won&apos;t play on a phone, download it.
                </p>
              ) : null}
              <Button variant="secondary" asChild>
                <a href={url(open, "?download=1")}>
                  <Download aria-hidden className="size-4" />
                  Download
                </a>
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
