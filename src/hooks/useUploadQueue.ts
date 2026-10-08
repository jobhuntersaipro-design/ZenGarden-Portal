"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PresignResponse,
  PresignedFile,
} from "@/app/api/upload/presign/route";
import type { CompleteResponse } from "@/app/api/upload/complete/route";
import { retryExtraction } from "@/actions/purchase-orders";
import {
  cancelBookingUpload,
  retryBookingConfirmation,
} from "@/actions/booking-confirmations";
import { expandZips } from "@/lib/upload/expand-zips";
import { MAX_FILES_PER_CALL, rejectionReason } from "@/lib/validation/upload";
import {
  READY_STATUS,
  isActiveStatus as isActive,
  type UploadRow,
  type UploadStatus,
} from "@/components/upload/queue-types";

export type { UploadRow, UploadStatus };
export { READY_STATUS };

/** Three at a time; the rest wait (docs/specs/03-upload.md §2). */
const CONCURRENCY = 3;
/** Ten per presign call, and no reason to let the queue grow without bound. */
const MAX_ROWS = MAX_FILES_PER_CALL * 10;

let counter = 0;
const nextId = () => `row-${Date.now()}-${counter++}`;

/**
 * Where a queue sends its files. Purchase orders and booking confirmations
 * (2026-10-08) answer the same presign and complete shapes, so one queue
 * drives both; only the endpoints differ.
 */
export type UploadTarget = {
  presign: string;
  complete: string;
  /** A row removed before its file finished arriving. Best effort. */
  cancel: (documentId: string) => Promise<unknown>;
  /** Read a FAILED upload again; the bytes are already in R2. */
  retry: (
    id: string,
  ) => Promise<
    | { success: true; data: { status: string; error: string | null } }
    | { success: false; error: string }
  >;
};

export const PO_UPLOAD: UploadTarget = {
  presign: "/api/upload/presign",
  complete: "/api/upload/complete",
  cancel: (documentId) => fetch(`/api/upload/${documentId}`, { method: "DELETE" }),
  retry: retryExtraction,
};

export const BOOKING_UPLOAD: UploadTarget = {
  presign: "/api/booking-confirmations/presign",
  complete: "/api/booking-confirmations/complete",
  cancel: cancelBookingUpload,
  retry: retryBookingConfirmation,
};

export function useUploadQueue(hintBuyerId?: string, target: UploadTarget = PO_UPLOAD) {
  const [rows, setRows] = useState<UploadRow[]>([]);

  /**
   * The ref is the queue; `rows` is a mirror of it for rendering. Keeping one
   * authoritative copy is what lets the pump decide how many slots are free
   * without reading React state mid-flight, where it would be a render behind.
   */
  const queue = useRef<UploadRow[]>([]);
  /** Live XHRs, so a removed row can abort its own upload. */
  const requests = useRef(new Map<string, XMLHttpRequest>());
  /** `run` finishes by refilling the slot it just freed; the ref breaks the cycle. */
  const pumpRef = useRef<() => void>(() => {});

  const commit = useCallback(
    (next: (current: UploadRow[]) => UploadRow[]) => {
      queue.current = next(queue.current);
      setRows(queue.current);
    },
    [],
  );

  const patch = useCallback(
    (id: string, next: Partial<UploadRow>) => {
      commit((current) =>
        current.map((row) => (row.id === id ? { ...row, ...next } : row)),
      );
    },
    [commit],
  );

  const fail = useCallback(
    (id: string, reason: string) => {
      requests.current.delete(id);
      patch(id, { status: "failed", reason, progress: 0 });
    },
    [patch],
  );

  /** PUT the bytes. XHR rather than fetch: only XHR reports upload progress. */
  const putToR2 = useCallback(
    (row: UploadRow, presigned: PresignedFile) =>
      new Promise<void>((resolve, reject) => {
        if (!row.file) {
          reject(new Error("That file is no longer available"));
          return;
        }
        const xhr = new XMLHttpRequest();
        requests.current.set(row.id, xhr);
        xhr.open("PUT", presigned.url, true);
        xhr.setRequestHeader("Content-Type", row.file.type);
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          patch(row.id, {
            progress: Math.round((event.loaded / event.total) * 100),
          });
        };
        xhr.onload = () => {
          requests.current.delete(row.id);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          // A 403 here is nearly always the bucket's CORS policy or the pinned
          // Content-Type, not anything the user did.
          reject(new Error(`Storage refused the file (${xhr.status})`));
        };
        xhr.onerror = () =>
          reject(new Error("The upload was interrupted — check your connection"));
        xhr.onabort = () => reject(new Error("aborted"));
        xhr.send(row.file);
      }),
    [patch],
  );

  const run = useCallback(
    async (row: UploadRow) => {
      try {
        const presignResponse = await fetch(target.presign, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            files: [{ name: row.name, type: row.file?.type, size: row.size }],
          }),
        });
        if (!presignResponse.ok) {
          fail(row.id, "We couldn't start that upload");
          return;
        }
        const { files, errors } = (await presignResponse.json()) as PresignResponse;
        const presigned = files[0];
        if (!presigned) {
          fail(row.id, errors[0]?.reason ?? "We couldn't start that upload");
          return;
        }

        patch(row.id, {
          status: "uploading",
          progress: 0,
          documentId: presigned.documentId,
        });
        await putToR2(row, presigned);

        patch(row.id, { status: "extracting", progress: 100 });
        const completeResponse = await fetch(target.complete, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            documentId: presigned.documentId,
            ...(hintBuyerId ? { hintBuyerId } : {}),
          }),
        });
        if (!completeResponse.ok) {
          const body = (await completeResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          fail(row.id, body?.error ?? "The upload didn't finish");
          return;
        }
        const body = (await completeResponse.json()) as CompleteResponse;
        // The upload succeeded but the read may not have. A row that says
        // "Ready to review" when Claude could not read the document would put
        // it in the footer's count and promise a review that cannot happen.
        if (body.status === "FAILED") {
          patch(row.id, {
            status: "failed",
            progress: 100,
            extractionId: body.extractionId,
            reason:
              body.error ??
              "We couldn't read that document — open it to fill it in by hand",
          });
          return;
        }
        patch(row.id, {
          status: "ready",
          progress: 100,
          extractionId: body.extractionId,
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        // An abort is the user removing the row; that row is already gone.
        if (message !== "aborted") fail(row.id, message);
      } finally {
        pumpRef.current();
      }
    },
    [fail, hintBuyerId, patch, putToR2, target],
  );

  /**
   * Claims whatever slots are free and starts that many queued rows. Called
   * when work arrives and again as each row settles, so a retry or a removal
   * refills the slot without any extra bookkeeping.
   */
  const pump = useCallback(() => {
    const active = queue.current.filter((row) => isActive(row.status)).length;
    const slots = CONCURRENCY - active;
    if (slots <= 0) return;
    const starting = queue.current
      .filter((row) => row.status === "queued")
      .slice(0, slots);
    if (starting.length === 0) return;

    // Marked before any await, so a second pump cannot start the same row.
    const ids = new Set(starting.map((row) => row.id));
    commit((current) =>
      current.map((row) =>
        ids.has(row.id)
          ? { ...row, status: "presigning" as const, reason: undefined }
          : row,
      ),
    );
    for (const row of starting) void run(row);
  }, [commit, run]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const add = useCallback(
    (incoming: File[]) => {
      // A zip is opened here, in the browser, so each PO inside it is its own
      // row, its own upload and its own draft — exactly as if it were dropped.
      void expandZips(incoming).then((items) => {
        commit((current) => [
          ...current,
          ...items
            .slice(0, Math.max(0, MAX_ROWS - current.length))
            .map<UploadRow>((item) => {
              if (!(item instanceof File)) {
                return { id: nextId(), file: null, ...item, status: "failed", progress: 0 };
              }
              // Checked here so an obviously wrong file gets its reason without
              // a round trip (docs/specs/03-upload.md §2).
              const reason = rejectionReason({
                name: item.name,
                type: item.type,
                size: item.size,
              });
              return {
                id: nextId(),
                file: reason ? null : item,
                name: item.name,
                size: item.size,
                status: reason ? "failed" : "queued",
                progress: 0,
                ...(reason ? { reason } : {}),
              };
            }),
        ]);
        pump();
      });
    },
    [commit, pump],
  );

  const remove = useCallback(
    (id: string) => {
      const row = queue.current.find((candidate) => candidate.id === id);
      requests.current.get(id)?.abort();
      requests.current.delete(id);
      commit((current) => current.filter((candidate) => candidate.id !== id));
      // Best effort: the row is gone from the UI either way, and the orphan
      // sweep in `src/lib/queries/documents.ts` is the backstop.
      if (row?.documentId) {
        void target.cancel(row.documentId).catch(() => {});
      }
      pump();
    },
    [commit, pump, target],
  );

  const retry = useCallback(
    (id: string) => {
      const row = queue.current.find((candidate) => candidate.id === id);
      if (!row) return;

      // The bytes are already in R2 and only the reading failed, so this asks
      // for another read rather than another upload. Re-uploading a file that
      // arrived intact would waste the transfer and orphan the first document.
      if (row.extractionId) {
        patch(id, { status: "extracting", progress: 100, reason: undefined });
        void target.retry(row.extractionId).then((result) => {
          if (!result.success) {
            fail(id, result.error);
            return;
          }
          if (result.data.status === "FAILED") {
            fail(
              id,
              result.data.error ??
                "We still couldn't read that document — open it to fill it in by hand",
            );
            return;
          }
          patch(id, { status: "ready", progress: 100, reason: undefined });
        });
        return;
      }

      // A row rejected before it ever held a File has nothing to retry.
      if (!row.file) return;
      patch(id, { status: "queued", progress: 0, reason: undefined });
      pump();
    },
    [fail, patch, pump, target],
  );

  const busy = rows.some(
    (row) => isActive(row.status) || row.status === "queued",
  );

  /** Nothing in flight should be lost to a stray tab close. */
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  return { rows, add, remove, retry, busy };
}
