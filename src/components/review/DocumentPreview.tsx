"use client";

import { useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { DocumentUrlResponse } from "@/app/api/documents/[documentId]/url/route";
import { Button } from "@/components/ui/button";
import {
  ZoomControls,
  type Zoom,
  stepZoom,
} from "@/components/review/ZoomControls";
import { DownloadOriginal } from "@/components/purchase-orders/DownloadOriginal";

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
  const [zoom, setZoom] = useState<Zoom>("fit");

  /**
   * Measures the scrolling container, not the card around it: the card carries
   * `p-sm`, and `clientWidth` includes padding, so measuring the card rendered
   * the page a padding-width too wide and pushed the review page sideways on a
   * phone.
   *
   * A ResizeObserver rather than a single measurement on mount, because "Fit"
   * has to stay honest when the viewport changes — rotating a phone otherwise
   * leaves the page at the width it had in the other orientation.
   */
  const viewportRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // "fit" is 1× of the container width; a number is a multiple of it. Keeping
  // the resolved number in one place is what lets the controls show an honest
  // percentage and the wheel step from wherever the page actually is.
  const scale = zoom === "fit" ? 1 : zoom;

  /**
   * Ctrl/Cmd + wheel zooms; a plain wheel scrolls the document, untouched.
   * The listener is passive:false via onWheel on a div, so preventDefault
   * works and the page behind does not zoom with it.
   */
  const onWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(stepZoom(scale, event.deltaY < 0 ? 1 : -1));
  };

  const toggleFit = () => setZoom((current) => (current === "fit" ? 1 : "fit"));
  /** Bumped by "Try preview again"; re-runs the fetch below. */
  const [attempt, setAttempt] = useState(0);

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
  }, [documentId, attempt]);

  if (error) {
    return (
      // The message alone left the reader with nowhere to go: the only way to
      // see the file was a Download button in the page header, which is not
      // where anyone looks after reading an error (brief §4). Both recoveries
      // now sit with the thing that failed.
      <div className="flex flex-col items-start gap-sm rounded-lg border border-hairline bg-surface p-lg">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {error} The extracted data is still shown beside it.
        </p>
        <div className="flex flex-wrap items-center gap-sm">
          <DownloadOriginal documentId={documentId} />
          <button
            type="button"
            onClick={() => {
              // A fresh presigned URL and a fresh render. The usual cause is
              // an expired link or a blip fetching it, and both survive a
              // second attempt.
              setError(null);
              setSource(null);
              setAttempt((current) => current + 1);
            }}
            className="inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
          >
            Try preview again
          </button>
        </div>
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
      <div className="min-w-0 rounded-lg border border-hairline bg-surface p-sm">
        <div className="mb-sm flex justify-end">
          <ZoomControls scale={scale} onChange={setZoom} />
        </div>
        {/* The scroll container is here, not on the image: a zoomed scan must
            scroll inside its own card and never widen the page. */}
        <div
          className="max-h-preview min-w-0 overflow-auto"
          onWheel={onWheel}
          onDoubleClick={toggleFit}
        >
          {/* A presigned R2 URL is short-lived and host-specific, so it cannot
              be a configured next/image remote pattern; this is the scan
              itself, shown once, not a gallery image worth optimising. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source.url}
            alt={`Scan of ${originalName}`}
            className="max-w-none rounded-sm"
            style={{ width: `${scale * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-surface p-sm">
      <div className="mb-sm flex justify-end">
        <ZoomControls scale={scale} onChange={setZoom} />
      </div>
      {/* The scroll container is here, not on the page: a zoomed document must
          scroll inside its own card and never widen the layout. */}
      <div
        ref={viewportRef}
        className="max-h-preview min-w-0 overflow-auto"
        onWheel={onWheel}
        onDoubleClick={toggleFit}
      >
      <Document
        file={source.url}
        onLoadSuccess={({ numPages }) => setPages(numPages)}
        onLoadError={() => setError("We couldn't read that PDF.")}
        loading={
          <div className="h-preview animate-pulse rounded-sm bg-surface-soft" />
        }
      >
        <Page
          pageNumber={page}
          // react-pdf sizes by width, so scaling the width *is* the zoom.
          width={width ? width * scale : undefined}
          renderAnnotationLayer={false}
        />
      </Document>
      </div>
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
