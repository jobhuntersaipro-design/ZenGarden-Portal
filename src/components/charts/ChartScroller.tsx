"use client";

import type { ReactNode } from "react";
import { useEdgeFades } from "@/hooks/useEdgeFades";

/**
 * Gives a chart a floor on its plot width and scrolls it sideways when the
 * viewport cannot supply that.
 *
 * A `ResponsiveContainer` will draw whatever width it is handed. On a 390px
 * phone the buyer trend's plot measured **86px for 13 months**: the line became
 * a vertical smear and every value label landed on top of the next
 * (2026-09-06 review, A1). The honest answer is that a 30-bucket series needs
 * room — so the card keeps its width and the plot gets its own, with a fade at
 * whichever edge has more to reach.
 *
 * At desktop widths `min-width` is under 100% and this is a no-op wrapper.
 */
export function ChartScroller({
  buckets,
  /** Room the axis and labels need on top of the buckets themselves. */
  axisWidth = 80,
  /** Horizontal room one bucket needs to stay legible. */
  perBucket = 24,
  /** The surface behind the chart, so the fade dissolves into it. */
  fade = "canvas",
  className = "",
  children,
}: {
  buckets: number;
  axisWidth?: number;
  perBucket?: number;
  fade?: "canvas" | "surface";
  className?: string;
  children: ReactNode;
}) {
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();
  const minWidth = axisWidth + buckets * perBucket;
  // Written out rather than interpolated: Tailwind only emits the classes it
  // can see as whole strings.
  const from = fade === "surface" ? "from-surface" : "from-canvas";

  return (
    <div className={`relative ${className}`}>
      <div ref={ref} onScroll={measure} className="overflow-x-auto">
        {/* `min-width` in px against a `100%` floor: the chart fills the card
            whenever the card is wide enough, and only overflows when it is not. */}
        <div
          style={{
            minWidth: `min(100%, ${minWidth}px)`,
            width: `max(100%, ${minWidth}px)`,
          }}
        >
          {children}
        </div>
      </div>

      {clipped.left ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 w-lg bg-linear-to-r to-transparent ${from}`}
        />
      ) : null}
      {clipped.right ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 w-lg bg-linear-to-l to-transparent ${from}`}
        />
      ) : null}
    </div>
  );
}
