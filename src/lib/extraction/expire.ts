import { ExtractionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

/**
 * How long a read may run before it is called failed (S-12, 2026-09-29).
 *
 * The read runs inside the upload request (`/api/upload/complete`,
 * `maxDuration` 120s) or the Try again action. When that function is cut off
 * the row is left RUNNING, and until today nothing ever moved it: the review
 * screen showed "Reading the document…" for good and the dashboard counted it
 * as still extracting. Five minutes is past either limit with room to spare,
 * so a row this old is not slow, it is gone.
 */
export const EXTRACTION_TIMEOUT_MS = 5 * 60 * 1000;

export const EXTRACTION_TIMEOUT_ERROR =
  "Reading this document took too long and was stopped.";

/** The rows a sweep at `now` would call timed out. Pure, so it is testable. */
export function staleExtractionWhere(now: Date) {
  const cutoff = new Date(now.getTime() - EXTRACTION_TIMEOUT_MS);
  return {
    OR: [
      { status: ExtractionStatus.RUNNING, startedAt: { lt: cutoff } },
      // Never started, or started without a stamp: the row's own age is all
      // there is to go on.
      { status: ExtractionStatus.RUNNING, startedAt: null, createdAt: { lt: cutoff } },
      { status: ExtractionStatus.PENDING, createdAt: { lt: cutoff } },
    ],
  };
}

/**
 * Marks every read that has outlived `EXTRACTION_TIMEOUT_MS` as FAILED with a
 * reason, so the review screen offers Try again and hand entry instead of a
 * skeleton. Lazy: called by the screens that read extraction status, since
 * there is no scheduler to run it. A read that was only slow and finishes
 * later still writes SUCCEEDED over this — nothing is lost by calling it early.
 *
 * Never throws: a sweep that fails must not take the page that called it down.
 */
export async function expireStaleExtractions(now = new Date()): Promise<number> {
  try {
    const { count } = await prisma.extraction.updateMany({
      where: staleExtractionWhere(now),
      data: {
        status: ExtractionStatus.FAILED,
        error: EXTRACTION_TIMEOUT_ERROR,
        finishedAt: now,
      },
    });
    return count;
  } catch (cause) {
    console.error("[extraction] expireStaleExtractions", cause);
    return 0;
  }
}
