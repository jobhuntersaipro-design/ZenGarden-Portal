"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { DocumentUrlResponse } from "@/app/api/documents/[documentId]/url/route";
import { Button } from "@/components/ui/button";

/**
 * The presigned URL is fetched on click rather than rendered into the page:
 * it lives ten minutes, and a link minted at render time is often already
 * dead by the time someone uses it.
 */
export function DownloadOriginal({ documentId }: { documentId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={async () => {
        setPending(true);
        try {
          const response = await fetch(
            `/api/documents/${documentId}/url?download=1`,
          );
          if (!response.ok) throw new Error("no url");
          const { url } = (await response.json()) as DocumentUrlResponse;
          window.open(url, "_blank", "noopener");
        } catch {
          toast.error("We couldn't fetch that file.");
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Preparing…" : "Download original"}
    </Button>
  );
}
