"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Button } from "@/components/ui/button";
import { formatBytes, MAX_FILE_BYTES } from "@/lib/validation/upload";

/** Arc caps a drop at its own count; the queue takes any number. */
const MAX_BATCH = 100;

/**
 * Arc's file dropzone as the target. Drop, browse, paste and the camera all
 * funnel into the same `onFiles`
 * (design reference §3.3). Paste matters more than it looks: a screenshot of a
 * PO is the most common thing an ops person has on the clipboard.
 *
 * The camera is the mobile answer. "Drop PO files here" is meaningless on a
 * phone, and photographing a PO is the native way to capture one on a product
 * whose whole intake is PO photographs (2026-09-06 review, B6) — so below `sm`
 * "Take a photo" sits under the target.
 */
export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  /** A second input: `capture` cannot be toggled per click on one element. */
  const camera = useRef<HTMLInputElement>(null);
  /**
   * Arc's dropzone keeps a list of its own; ours is the upload queue below,
   * which validates, uploads and reports each file. So the target hands every
   * batch over and is remounted empty, rather than showing a second list.
   */
  const [batch, setBatch] = useState(0);

  const handle = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // Arc's target takes a paste itself while it is hovered or focused.
      if (event.defaultPrevented) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) onFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  return (
    <div className="flex flex-col gap-sm">
      {/* No `accept` and no size limit here: a refused file belongs in the
          queue with its reason ("That image is 17.2 MB…"), where the rest of
          the batch still uploads, not in a message the remount would erase. */}
      <FileDropzone
        key={batch}
        multiple
        maxFiles={MAX_BATCH}
        label="Add purchase orders"
        description="Drop files here, paste a screenshot, or choose from your device"
        note={`PDF, PNG, JPG or a ZIP of them — up to ${formatBytes(MAX_FILE_BYTES)} each`}
        dropLabel="Drop to upload"
        onFilesChange={(files) => {
          handle(files);
          setBatch((n) => n + 1);
        }}
      />
      {/* Phones only: `capture` is inert on a desktop browser, and the
          button would be a dead end there. */}
      <Button
        type="button"
        className="self-center sm:hidden"
        onClick={() => camera.current?.click()}
      >
        <Camera className="size-4" strokeWidth={1.75} aria-hidden />
        Take a photo
      </Button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        // `environment` is the rear camera — the one pointed at paper.
        capture="environment"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          handle(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
