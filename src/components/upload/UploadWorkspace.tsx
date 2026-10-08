"use client";

import Link from "next/link";
import { BOOKING_UPLOAD, PO_UPLOAD, useUploadQueue } from "@/hooks/useUploadQueue";
import { Dropzone } from "@/components/upload/Dropzone";
import { UploadFooter } from "@/components/upload/UploadFooter";
import { UploadQueue } from "@/components/upload/UploadQueue";

/**
 * What differs between the two intakes. A booking confirmation has no review
 * queue to step through, so several ready ones open the list at Needs review.
 */
const KINDS = {
  po: {
    target: PO_UPLOAD,
    label: "Add purchase orders",
    noun: "PO",
    cancelHref: "/purchase-orders",
    reviewHref: undefined,
  },
  bc: {
    target: BOOKING_UPLOAD,
    label: "Add booking confirmations",
    noun: "BC",
    cancelHref: "/booking-confirmations",
    reviewHref: (ids: string[]) =>
      ids.length === 1
        ? `/booking-confirmations/${ids[0]}`
        : "/booking-confirmations?status=needs-review",
  },
} as const;

export function UploadWorkspace({
  hintBuyerId,
  kind = "po",
}: {
  hintBuyerId?: string;
  kind?: keyof typeof KINDS;
}) {
  const config = KINDS[kind];
  const { rows, add, remove, retry } = useUploadQueue(hintBuyerId, config.target);

  return (
    <>
      <Dropzone onFiles={add} label={config.label} />
      <UploadQueue rows={rows} onRemove={remove} onRetry={retry} noun={config.noun} />
      <UploadFooter rows={rows} reviewHref={config.reviewHref} />
      {/* Back sits above the title (brief G2); Cancel stays here beside the
          footer, where someone who has decided to abandon a queue is already
          looking. */}
      <div className="mt-md">
        <Link
          href={config.cancelHref}
          className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          Cancel
        </Link>
      </div>
    </>
  );
}
