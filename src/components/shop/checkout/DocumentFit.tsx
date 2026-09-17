"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ZoomControls, type Zoom } from "@/components/review/ZoomControls";

/** The sheet's own width — `--spacing-po-page`, which `w-po-page` reads. */
const SHEET_PX = 1070;

/**
 * The purchase-order sheet at a readable size (2026-09-17).
 *
 * Until now the sheet was fixed at 1070px and scrolled sideways inside its
 * frame on anything narrower, so a phone showed its left third. It opens at
 * **Fit** — the whole width of the page in view, nothing cropped — with the
 * same −/+/Fit as the portal's document preview for reading closer.
 *
 * The sheet keeps its proportions: this scales it with CSS `zoom` rather than
 * letting it reflow, because a document that reflows is not the document
 * (Phase 33). `zoom`, not a transform, so the scaled sheet takes up its scaled
 * size and the frame's height follows it. Printing resets it to 1 and hides
 * the controls (`globals.css`).
 */
export function DocumentFit({ children }: { children: ReactNode }) {
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [available, setAvailable] = useState(0);

  // Measured on a block inside the scroller, so it reads the room the sheet
  // has and not the sheet's own width, and re-fits when a phone rotates.
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() => setAvailable(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fit = available > 0 ? available / SHEET_PX : 1;
  const scale = zoom === "fit" ? fit : zoom;

  return (
    <div
      data-po-frame
      className="min-w-0 rounded-lg border border-hairline bg-surface p-md"
    >
      <div data-po-controls className="mb-sm flex justify-end">
        <ZoomControls scale={scale} onChange={setZoom} />
      </div>
      <div data-po-scroller className="min-w-0 overflow-x-auto">
        <div ref={measureRef}>
          {/* Inline because the value is measured at runtime; there is no
              token for "the width this frame happens to have". */}
          <div data-po-zoom style={{ zoom: scale }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
