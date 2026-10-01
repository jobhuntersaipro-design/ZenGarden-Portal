"use client";

import type { ReactNode } from "react";
import { shownTickCount } from "@/components/charts/labels";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";

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
/** Rough width of one character at `LABEL_FONT_SIZE`, plus breathing room. */
const CHAR_PX = 6.6;
const TICK_GAP_PX = 16;

export function ChartScroller({
  buckets,
  /** Room the axis and labels need on top of the buckets themselves. */
  axisWidth = 80,
  /** Horizontal room one bucket needs to stay legible. */
  perBucket = 24,
  /**
   * The x-axis labels, so the floor accounts for how wide they actually are.
   * A weekly axis reads "31 Aug–6 Sep", more than three times the width of a
   * daily "6 Jul", and 24px a bucket left them overlapping into each other.
   * Only the ticks the axis will really print are counted — it shows at most
   * twelve, however many buckets there are.
   */
  labels,
  className = "",
  children,
}: {
  buckets: number;
  axisWidth?: number;
  perBucket?: number;
  labels?: string[];
  className?: string;
  children: ReactNode;
}) {
  const longest =
    labels?.reduce((max, label) => Math.max(max, label.length), 0) ?? 0;
  const labelFloor =
    longest > 0
      ? shownTickCount(buckets) * (longest * CHAR_PX + TICK_GAP_PX)
      : 0;
  const minWidth = axisWidth + Math.max(buckets * perBucket, labelFloor);

  // Arc's scroll area: its own edge fades (a mask, so they dissolve into
  // whatever surface sits behind), scrollbars that show while scrolling, and
  // a vertical wheel turned sideways. Unlabelled, so it adds no tab stop.
  return (
    <ScrollArea
      orientation="horizontal"
      fade={32}
      wheelToHorizontal={false}
      className={className}
    >
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
    </ScrollArea>
  );
}
