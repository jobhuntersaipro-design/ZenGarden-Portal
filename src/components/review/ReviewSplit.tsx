"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  ResizablePanel,
  ResizablePanels,
} from "@/components/arc/resizable-panels/resizable-panels";

/** Tailwind's `xl`, where the document and the fields first sit side by side. */
const WIDE = "(min-width: 80rem)";

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/**
 * The review screen's document and its fields. From `xl` they are Arc's
 * resizable panels, so a reviewer can drag the divider to give a dense scan
 * more room or the fields more width, or collapse the document entirely;
 * below `xl` they stack, document first, exactly as before. The server and
 * the first client render draw the stacked grid, so nothing hydrates
 * differently; the panels take over once the width is known.
 */
export function ReviewSplit({
  document,
  children,
}: {
  document: ReactNode;
  children: ReactNode;
}) {
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

  if (!wide) {
    return (
      <div className="grid min-w-0 gap-xl xl:grid-cols-document">
        <div className="min-w-0 xl:sticky xl:top-md xl:self-start">{document}</div>
        {children}
      </div>
    );
  }

  return (
    <ResizablePanels label="Document and fields">
      <ResizablePanel id="review-document" label="Document" defaultSize={62} minSize={360} collapsible>
        <div className="pr-lg">{document}</div>
      </ResizablePanel>
      <ResizablePanel id="review-fields" label="Fields" defaultSize={38} minSize={320}>
        <div className="pl-lg">{children}</div>
      </ResizablePanel>
    </ResizablePanels>
  );
}
