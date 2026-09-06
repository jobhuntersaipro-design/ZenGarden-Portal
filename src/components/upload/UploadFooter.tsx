"use client";

import Link from "next/link";
import type { UploadRow } from "@/components/upload/queue-types";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";
import { summariseQueue } from "@/components/upload/summarise-queue";

/**
 * N counts rows in the ready state and nothing else — never failed, never
 * uploading, never queued. A button offering to review a file that cannot be
 * reviewed is a broken promise (design reference §3.3), so whatever is being
 * left behind is named beside it instead.
 */
export function UploadFooter({ rows }: { rows: UploadRow[] }) {
  if (rows.length === 0) return null;

  const { ready, readyIds, excluded } = summariseQueue(rows);
  const queue = readyIds.join(",");

  return (
    <div className="sticky bottom-0 z-10 mt-md flex items-center justify-end gap-md border-t border-hairline bg-canvas py-md">
      {excluded ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          Not included: {excluded}
        </p>
      ) : null}
      {/* Disabled rather than hidden at zero, so the footer never jumps. */}
      {ready === 0 ? (
        <Button disabled className="bg-surface-soft text-ink-disabled">
          Review {ready} files
        </Button>
      ) : (
        <Button asChild>
          <Link
            href={`/review/${readyIds[0]}?queue=${encodeURIComponent(queue)}`}
          >
            <LinkSpinner />
            Review {ready} {ready === 1 ? "file" : "files"}
          </Link>
        </Button>
      )}
    </div>
  );
}
