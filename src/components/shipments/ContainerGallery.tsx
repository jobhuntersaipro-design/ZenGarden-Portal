"use client";

import { useState, useTransition } from "react";
import { Download, Play, Trash2 } from "lucide-react";
import type { ContainerMediaKind } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type GalleryItem = {
  id: string;
  kind: ContainerMediaKind;
  originalName: string;
  /** Under the tile: who uploaded it (staff only; a buyer never sees a name). */
  by?: string;
  date: string;
  /** Staff only: a note on this photo or video. */
  note?: string | null;
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
  onNote,
}: {
  base: string;
  items: GalleryItem[];
  onDelete?: (item: GalleryItem) => void;
  /** Saves a note (blank clears it); resolves true once saved. */
  onNote?: (item: GalleryItem, note: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<GalleryItem | null>(null);
  // A video plays in its own tile (2026-10-18); a photo opens the panel.
  const [playing, setPlaying] = useState<string | null>(null);
  const [unplayable, setUnplayable] = useState<Set<string>>(new Set());
  const url = (item: GalleryItem, query = "") => `${base}/${item.id}/url${query}`;
  return (
    <>
      <ul className="grid grid-cols-2 gap-sm sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0 flex-col gap-xxs">
            <div className="relative">
              {playing === item.id ? (
                unplayable.has(item.id) ? (
                  <div className="flex aspect-square w-full flex-col items-center justify-end gap-xs rounded-md bg-ink p-sm text-center text-[length:var(--text-caption)] text-canvas">
                    <span>Can&apos;t play here.</span>
                    <Button variant="secondary" size="sm" asChild>
                      <a href={url(item, "?download=1")}>
                        <Download aria-hidden className="size-4" />
                        Download
                      </a>
                    </Button>
                  </div>
                ) : (
                  <video
                    src={url(item)}
                    controls
                    autoPlay
                    playsInline
                    onError={() => setUnplayable((prev) => new Set(prev).add(item.id))}
                    aria-label={item.originalName}
                    className="block aspect-square w-full rounded-md bg-ink object-contain"
                  />
                )
              ) : (
                <button
                  type="button"
                  onClick={() => (item.kind === "VIDEO" ? setPlaying(item.id) : setOpen(item))}
                  className="block aspect-square w-full overflow-hidden rounded-md border border-hairline bg-surface-soft focus-visible:outline-2 focus-visible:outline-focus"
                  aria-label={`${item.kind === "VIDEO" ? "Play" : "Open"} ${item.originalName}`}
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
              )}
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
            {onNote || item.note ? <MediaNote item={item} onNote={onNote} /> : null}
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

/** The note under a tile, and its inline editor for staff who manage the shipment. */
function MediaNote({ item, onNote }: { item: GalleryItem; onNote?: (item: GalleryItem, note: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  if (draft !== null && onNote)
    return (
      <form
        className="flex flex-col gap-xxs"
        onSubmit={(event) => {
          event.preventDefault();
          startSaving(async () => {
            if (await onNote(item, draft)) setDraft(null);
          });
        }}
      >
        <label htmlFor={`media-note-${item.id}`} className="sr-only">
          Note on {item.originalName}
        </label>
        <Textarea
          id={`media-note-${item.id}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          rows={2}
          autoFocus
          placeholder="What does this show?"
        />
        <div className="flex flex-wrap gap-xxs">
          <Button type="submit" size="sm" pending={saving} disabled={draft.trim() === (item.note ?? "")}>
            Save
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  return (
    <div className="flex min-w-0 flex-col items-start gap-xxs">
      {item.note ? (
        <p className="whitespace-pre-line break-words text-[length:var(--text-body-sm)] text-ink">{item.note}</p>
      ) : null}
      {onNote ? (
        <Button type="button" variant="ghost" size="sm" className="-ml-xs" onClick={() => setDraft(item.note ?? "")}>
          {item.note ? "Edit note" : "Add note"}
        </Button>
      ) : null}
    </div>
  );
}
