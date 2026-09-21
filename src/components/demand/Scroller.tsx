"use client";

import type { ReactNode } from "react";
import { useEdgeFades } from "@/hooks/useEdgeFades";

/**
 * The board is wider than a phone and often wider than a laptop — a week
 * column per week, plus five fixed ones. A container that clips with no
 * visible edge does not look scrollable, it looks like a table missing a
 * column, which is how it was reported on the line-items table in Phase 11.
 * Same hook, same fades.
 */
export function Scroller({ children }: { children: ReactNode }) {
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();

  return (
    <div className="relative">
      <div ref={ref} onScroll={measure} className="overflow-x-auto">
        {children}
      </div>
      {clipped.left ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-xl bg-linear-to-r from-canvas to-transparent"
        />
      ) : null}
      {clipped.right ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-xl bg-linear-to-l from-canvas to-transparent"
        />
      ) : null}
    </div>
  );
}
