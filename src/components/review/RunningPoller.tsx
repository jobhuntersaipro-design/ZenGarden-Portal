"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getExtractionStatus } from "@/actions/purchase-orders";
import { ExtractionStatus } from "@/generated/prisma/enums";

const POLL_MS = 3000;

/**
 * Extraction runs inline in the upload request, so this screen is only reached
 * mid-flight by someone who opened the link early or refreshed. Skeleton plus a
 * poll until the row settles (docs/specs/04-extraction-review.md §3).
 */
export function RunningPoller({ extractionId }: { extractionId: string }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      void getExtractionStatus(extractionId).then((result) => {
        if (!result.success) return;
        if (
          result.data.status !== ExtractionStatus.RUNNING &&
          result.data.status !== ExtractionStatus.PENDING
        ) {
          router.refresh();
        }
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [extractionId, router]);

  return (
    <div className="grid gap-xl lg:grid-cols-2">
      <div className="h-preview animate-pulse rounded-lg bg-surface-soft" />
      <div className="flex flex-col gap-md">
        <p className="text-[length:var(--text-body-md)] text-ink-secondary">
          Reading the document…
        </p>
        {[...Array(6)].map((_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-sm bg-surface-soft" />
        ))}
      </div>
    </div>
  );
}
