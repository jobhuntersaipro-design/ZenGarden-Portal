"use client";

import Link from "next/link";
import type { UploadRow } from "@/hooks/useUploadQueue";
import { READY_STATUS } from "@/hooks/useUploadQueue";
import { Button } from "@/components/ui/button";

/**
 * N counts rows in the ready state and nothing else — never failed, never
 * uploading, never queued. A button offering to review a file that cannot be
 * reviewed is a broken promise (design reference §3.3), so whatever is being
 * left behind is named beside it instead.
 */
export function UploadFooter({ rows }: { rows: UploadRow[] }) {
  if (rows.length === 0) return null;

  const ready = rows.filter((row) => row.status === READY_STATUS).length;
  const inFlight = rows.filter(
    (row) =>
      row.status === "queued" ||
      row.status === "presigning" ||
      row.status === "uploading" ||
      row.status === "completing",
  ).length;
  const failed = rows.filter((row) => row.status === "failed").length;

  const excluded = [
    inFlight > 0 ? `${inFlight} still uploading` : null,
    failed > 0 ? `${failed} failed` : null,
  ].filter(Boolean);

  return (
    <div className="sticky bottom-0 z-10 mt-md flex items-center justify-end gap-md border-t border-hairline bg-canvas py-md">
      {excluded.length > 0 ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          Not included: {excluded.join(" · ")}
        </p>
      ) : null}
      {/* Disabled rather than hidden at zero, so the footer never jumps. */}
      {ready === 0 ? (
        <Button disabled className="bg-surface-soft text-ink-disabled">
          Review {ready} files
        </Button>
      ) : (
        <Button asChild>
          {/* Phase 04 points this at /review/[firstExtractionId]. */}
          <Link href="/purchase-orders">
            Review {ready} {ready === 1 ? "file" : "files"}
          </Link>
        </Button>
      )}
    </div>
  );
}
