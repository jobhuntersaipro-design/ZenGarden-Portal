"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which horizontal edges of a scroller still have content past them, so
 * a caller can fade the side there is more to reach.
 *
 * Extracted from `DataTable`, which had this inline, when `ChartScroller`
 * needed the same affordance (2026-09-06 review, A1/B1). A container that clips
 * its content with no visible edge does not look scrollable — it looks like a
 * table missing a column, or a chart that stops.
 */
export function useEdgeFades<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [clipped, setClipped] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const left = node.scrollLeft > 1;
    const right = node.scrollWidth - node.clientWidth - node.scrollLeft > 1;
    // Same object back when nothing moved, so a scroll inside the current
    // state does not re-render on every frame.
    setClipped((previous) =>
      previous.left === left && previous.right === right
        ? previous
        : { left, right },
    );
  }, []);

  /**
   * A ResizeObserver rather than a measurement taken once on mount: at mount
   * the content has not been laid out, so `scrollWidth` reads as the container
   * width and the fade never appears until the reader scrolls — which is
   * precisely the reader who did not know there was anything to scroll to.
   * The observer fires immediately on observe and again whenever the viewport
   * or the content's own width changes.
   */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const child = node.firstElementChild;
    if (child) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  return { ref, clipped, measure };
}
