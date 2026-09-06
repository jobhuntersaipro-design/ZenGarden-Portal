"use client";

import Link from "next/link";
import { useUploadQueue } from "@/hooks/useUploadQueue";
import { Dropzone } from "@/components/upload/Dropzone";
import { UploadFooter } from "@/components/upload/UploadFooter";
import { UploadQueue } from "@/components/upload/UploadQueue";

export function UploadWorkspace({ hintBuyerId }: { hintBuyerId?: string }) {
  const { rows, add, remove, retry } = useUploadQueue(hintBuyerId);

  return (
    <>
      <Dropzone onFiles={add} />
      <UploadQueue rows={rows} onRemove={remove} onRetry={retry} />
      <UploadFooter rows={rows} />
      {/* Back sits above the title (brief G2); Cancel stays here beside the
          footer, where someone who has decided to abandon a queue is already
          looking. */}
      <div className="mt-md">
        <Link
          href="/purchase-orders"
          className="text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Cancel
        </Link>
      </div>
    </>
  );
}
