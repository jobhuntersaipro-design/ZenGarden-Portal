"use client";

import { useCallback, useRef, useState } from "react";
import type { PresignImageResponse } from "@/app/api/products/[id]/images/presign/route";
import { rejectionReason } from "@/lib/validation/product-images";

/**
 * A separate hook from `useUploadQueue` rather than a generalisation of it.
 * That one is purchase-order specific — it imports `retryExtraction` and models
 * `extracting` and `ready` states that mean nothing here — and Phase 04's
 * review of it concluded the status vocabulary should not be shared by
 * anything that does not share the journey.
 */
export type ImageRowStatus = "queued" | "uploading" | "processing" | "done" | "failed";

export type ImageRow = {
  id: string;
  name: string;
  status: ImageRowStatus;
  progress: number;
  reason?: string;
};

/** Matches the browser's own limit on parallel requests to one origin. */
const CONCURRENCY = 3;

export function useImageUploadQueue(productId: string, onDone: () => void) {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const busy = useRef(false);

  const patch = useCallback((id: string, next: Partial<ImageRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...next } : row)),
    );
  }, []);

  const put = useCallback(
    (url: string, file: File, id: string) =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url, true);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            patch(id, { progress: Math.round((event.loaded / event.total) * 100) });
          }
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Storage refused the file (${xhr.status})`));
        // Fires only for a network-level failure with no HTTP status, so the
        // message must not claim the server said anything.
        xhr.onerror = () =>
          reject(new Error("The upload was interrupted — check your connection"));
        xhr.send(file);
      }),
    [patch],
  );

  const add = useCallback(
    async (files: File[], existingCount: number) => {
      if (busy.current || files.length === 0) return;
      busy.current = true;

      // Rejected client-side first, so an obviously bad file gets its reason
      // without a round trip — the same contract the server re-applies.
      const local = files.map((file, index) => ({
        file,
        reason: rejectionReason(file, existingCount + index),
      }));
      const sendable = local.filter((entry) => !entry.reason);

      setRows(
        local.map((entry, index) => ({
          id: `${index}-${entry.file.name}`,
          name: entry.file.name,
          status: entry.reason ? ("failed" as const) : ("queued" as const),
          progress: 0,
          reason: entry.reason ?? undefined,
        })),
      );

      if (sendable.length === 0) {
        busy.current = false;
        return;
      }

      try {
        const response = await fetch(`/api/products/${productId}/images/presign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: sendable.map((entry) => ({
              name: entry.file.name,
              type: entry.file.type,
              size: entry.file.size,
            })),
          }),
        });
        if (!response.ok) throw new Error("presign");
        const body = (await response.json()) as PresignImageResponse;

        for (const error of body.errors) {
          const row = local.findIndex((entry) => entry.file.name === error.name);
          if (row >= 0) {
            patch(`${row}-${error.name}`, { status: "failed", reason: error.reason });
          }
        }

        // Three at a time. A serial loop is noticeably slower on a folder of
        // photographs and the browser caps parallel requests anyway.
        const queue = body.files.map((presigned) => {
          const index = local.findIndex(
            (entry) => entry.file.name === presigned.name,
          );
          return { presigned, entry: local[index], rowId: `${index}-${presigned.name}` };
        });

        let cursor = 0;
        const worker = async () => {
          while (cursor < queue.length) {
            const job = queue[cursor++];
            if (!job?.entry) continue;
            try {
              patch(job.rowId, { status: "uploading", progress: 0 });
              await put(job.presigned.url, job.entry.file, job.rowId);
              patch(job.rowId, { status: "processing", progress: 100 });
              const done = await fetch(
                `/api/products/${productId}/images/complete`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ imageId: job.presigned.imageId }),
                },
              );
              if (!done.ok) {
                const problem = (await done.json().catch(() => ({}))) as {
                  error?: string;
                };
                throw new Error(problem.error ?? "We couldn't process that image");
              }
              patch(job.rowId, { status: "done", progress: 100 });
            } catch (cause) {
              patch(job.rowId, {
                status: "failed",
                progress: 0,
                reason: cause instanceof Error ? cause.message : "That upload failed",
              });
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
        );
      } catch {
        setRows((current) =>
          current.map((row) =>
            row.status === "queued"
              ? { ...row, status: "failed", reason: "We couldn't reach the server" }
              : row,
          ),
        );
      } finally {
        // Always cleared, whatever happened. An unguarded await here is what
        // left the avatar picker permanently disabled on 2026-09-08.
        busy.current = false;
        onDone();
      }
    },
    [productId, patch, put, onDone],
  );

  const clear = useCallback(() => setRows([]), []);

  // `busy` is deliberately not returned. It is a ref, and reading one during
  // render is the defect Phase 03 fixed in the PO queue; the caller shows
  // pending state from its own transition instead.
  return { rows, add, clear };
}
