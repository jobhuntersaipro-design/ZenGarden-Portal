"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { DocumentUrlResponse } from "@/app/api/documents/[documentId]/url/route";
import { Button } from "@/components/ui/button";

// The worker ships with pdfjs-dist; resolving it through import.meta.url lets
// the bundler fingerprint it instead of us pointing at a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * The source column. Reused on PO detail in Phase 05, so it takes a document
 * id and nothing about extractions.
 */
export function DocumentPreview({
  documentId,
  originalName,
}: {
  documentId: string;
  originalName: string;
}) {
  const [source, setSource] = useState<DocumentUrlResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/url`);
        if (!response.ok) throw new Error("no url");
        const body = (await response.json()) as DocumentUrlResponse;
        if (!cancelled) setSource(body);
      } catch {
        if (!cancelled) setError("We couldn't load the original file.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (error) {
    return (
      <div className="rounded-lg border border-hairline bg-surface p-lg">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {error} The extracted data is still shown beside it.
        </p>
      </div>
    );
  }

  if (!source) {
    return (
      <div
        className="h-preview animate-pulse rounded-lg bg-surface-soft"
        aria-label="Loading the original file"
      />
    );
  }

  if (source.mimeType !== "application/pdf") {
    return (
      // A presigned R2 URL is short-lived and host-specific, so it cannot be a
      // configured next/image remote pattern; this is the scan itself, shown
      // once, not a gallery image worth optimising.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.url}
        alt={`Scan of ${originalName}`}
        className="w-full rounded-lg border border-hairline"
      />
    );
  }

  return (
    <div
      ref={(node) => {
        if (node && width === 0) setWidth(node.clientWidth);
      }}
      className="rounded-lg border border-hairline bg-surface p-sm"
    >
      <Document
        file={source.url}
        onLoadSuccess={({ numPages }) => setPages(numPages)}
        onLoadError={() => setError("We couldn't read that PDF.")}
        loading={<div className="h-preview animate-pulse rounded-sm bg-surface-soft" />}
      >
        <Page
          pageNumber={page}
          width={width || undefined}
          renderAnnotationLayer={false}
        />
      </Document>
      {pages > 1 ? (
        <div className="mt-sm flex items-center justify-center gap-md">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-secondary">
            Page {page} of {pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pages}
            onClick={() => setPage((current) => Math.min(pages, current + 1))}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
