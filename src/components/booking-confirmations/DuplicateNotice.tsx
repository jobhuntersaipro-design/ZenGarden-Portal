"use client";

import Link from "next/link";
import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import type { DuplicateBooking } from "@/lib/queries/booking-confirmations";

/**
 * Says a booking number is already on file, links the copy that is, and asks
 * whether to keep this one too. Shown in the upload queue as the file lands
 * and on the booking's own page, so a second copy is never reviewed unasked.
 */
export function DuplicateNotice({
  duplicates,
  onKeep,
  onDiscard,
}: {
  duplicates: DuplicateBooking[];
  /** Absent where keeping needs no answer, such as the booking's own page. */
  onKeep?: () => void;
  /** Absent for someone who may not delete it. */
  onDiscard?: () => Promise<void>;
}) {
  const [discarding, setDiscarding] = useState(false);
  const first = duplicates[0];
  if (!first) return null;
  const more = duplicates.length - 1;

  return (
    <div
      role="alert"
      className="flex flex-col gap-sm rounded-lg border border-brand-amber bg-surface-soft p-md"
    >
      <div className="flex gap-xs">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand-amber" aria-hidden />
        <p className="min-w-0 text-[length:var(--text-body-sm)] text-ink">
          Booking {first.bookingNumber} was also uploaded by {first.uploadedBy} on{" "}
          {formatDate(first.uploadedAt)}
          {more > 0 ? `, and ${more} more time${more === 1 ? "" : "s"}` : ""}.{" "}
          <Link
            href={`/booking-confirmations/${first.id}`}
            className="text-brand-link underline-offset-2 hover:underline"
          >
            Open it
          </Link>
          .{onKeep || onDiscard ? " Is this a second copy?" : null}
        </p>
      </div>
      {onKeep || onDiscard ? (
        <div className="flex flex-wrap gap-sm">
          {onDiscard ? (
            <Button
              variant="destructive"
              pending={discarding}
              onClick={async () => {
                setDiscarding(true);
                try {
                  await onDiscard();
                } finally {
                  setDiscarding(false);
                }
              }}
            >
              {discarding ? "Discarding…" : "Discard this one"}
            </Button>
          ) : null}
          {onKeep ? (
            <Button variant="outline" disabled={discarding} onClick={onKeep}>
              Keep both
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
