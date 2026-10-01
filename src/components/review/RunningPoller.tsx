"use client";

import { TextShimmer } from "@/components/arc/text-shimmer/text-shimmer";
import { useEffect, useState } from "react";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { getExtractionStatus } from "@/actions/purchase-orders";
import { ExtractionStatus } from "@/generated/prisma/enums";

const POLL_MS = 3000;

/** Past this the line says a long read is normal, before the timeout calls it failed. */
const SLOW_MS = 2 * 60 * 1000;

/** "0:42", "3:05". */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Extraction runs inline in the upload request, so this screen is only reached
 * mid-flight by someone who opened the link early or refreshed. Skeleton plus a
 * poll until the row settles (docs/specs/04-extraction-review.md §3).
 *
 * It says how long it has been reading (S-12, 2026-09-29): an endless
 * skeleton with nothing moving read as frozen. A read that outlives
 * `EXTRACTION_TIMEOUT_MS` is failed by the poll itself, and the refresh then
 * lands on Try again and hand entry.
 */
export function RunningPoller({
  extractionId,
  startedAt,
}: {
  extractionId: string;
  /** ISO. When the read began, or when the upload arrived if it never did. */
  startedAt: string;
}) {
  const refresh = useAwaitableRefresh();
  // Null until mounted: the server's clock and the browser's would not agree
  // on the first frame, and a hydration mismatch is worse than a blank second.
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const since = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - since);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    const timer = setInterval(() => {
      void getExtractionStatus(extractionId).then((result) => {
        if (!result.success) return;
        if (
          result.data.status !== ExtractionStatus.RUNNING &&
          result.data.status !== ExtractionStatus.PENDING
        ) {
          void refresh();
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [extractionId, refresh]);

  return (
    <div className="grid gap-xl lg:grid-cols-2">
      <div className="h-preview animate-pulse rounded-lg bg-surface-soft" />
      <div className="flex flex-col gap-md">
        <div aria-live="polite">
          <p className="text-[length:var(--text-body-md)] text-ink-secondary tabular-nums">
            {/* Arc's shimmer sweeps the line while Claude works, so the wait
                reads as work in progress rather than a frozen label. */}
            <TextShimmer>Reading the document…</TextShimmer>
            {/* A real space before the time, so a screen reader or a copy
                reads "document… 0:42" rather than "document…0:42". */}
            {elapsed === null ? null : (
              <span className="text-ink-tertiary"> {formatElapsed(elapsed)}</span>
            )}
          </p>
          {elapsed !== null && elapsed >= SLOW_MS ? (
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              Still reading. Large scans can take a few minutes — if it stops, you
              can try again or enter it by hand.
            </p>
          ) : null}
        </div>
        {[...Array(6)].map((_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-sm bg-surface-soft" />
        ))}
      </div>
    </div>
  );
}
