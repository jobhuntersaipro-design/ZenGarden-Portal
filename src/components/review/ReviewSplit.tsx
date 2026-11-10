"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  ResizablePanel,
  ResizablePanels,
} from "@/components/arc/resizable-panels/resizable-panels";

/**
 * Tailwind's `lg`, where the document and the fields first sit side by side.
 * It was `xl` until 2026-11-10, which stacked them on a laptop under 1280px
 * wide, the screen these are mostly read on (asked for as "make the uploaded
 * file and fields side by side"). At 1024 the content column is ~704px, which
 * holds both panes at their minimums below.
 */
const WIDE = "(min-width: 64rem)";

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/**
 * The review screen's document and its fields. From `lg` they are Arc's
 * resizable panels, so a reviewer can drag the divider to give a dense scan
 * more room or the fields more width, or collapse the document entirely;
 * below `lg` they stack, document first. The server and the first client
 * render draw a plain two-column grid, so nothing hydrates
 * differently; the panels take over once the width is known.
 */
export function ReviewSplit({
  document,
  documentSize = 62,
  children,
}: {
  document: ReactNode;
  /** The document's share of the width, in percent, from `lg`. */
  documentSize?: number;
  children: ReactNode;
}) {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

  if (!wide) {
    return (
      <div className="grid min-w-0 gap-xl lg:grid-cols-2">
        <div className="min-w-0 lg:sticky lg:top-md lg:self-start">{document}</div>
        {children}
      </div>
    );
  }

  return (
    <ResizablePanels label="Document and fields">
      <ResizablePanel id="review-document" label="Document" defaultSize={documentSize} minSize={300} collapsible>
        <div className="pr-lg">{document}</div>
      </ResizablePanel>
      <ResizablePanel id="review-fields" label="Fields" defaultSize={100 - documentSize} minSize={280}>
        <div className="pl-lg">{children}</div>
      </ResizablePanel>
    </ResizablePanels>
  );
}
