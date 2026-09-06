"use client";

import { useCallback, useState, type ReactElement } from "react";
import type { LabelProps } from "recharts";

/**
 * Every Recharts chart in the app animates the same way: 800 ms ease-out on
 * first paint and again on every data change, so a range switch morphs the
 * bars rather than swapping them. `isAnimationActive` stays at its "auto"
 * default, which is off during SSR and under prefers-reduced-motion.
 */
export const CHART_ANIMATION = {
  animationDuration: 800,
  animationEasing: "ease-out",
} as const;

/** Axis ticks and value labels share one size and the tertiary/secondary inks. */
export const LABEL_FONT_SIZE = 12;

// Inter at 12px runs ~7.5px per glyph for digits and capitals; the gap keeps
// neighbours apart.
const GLYPH_PX = 7.5;
const GAP_PX = 12;

/**
 * Which buckets carry a value label. `step` is the spacing — 1 labels every
 * bucket, 3 every third — chosen from the plot width and the longest label so
 * neighbours never overlap. 0 until the container has reported its width,
 * so nothing is drawn and then thinned.
 */
export function useLabelStep(bucketCount: number, longestLabel: number) {
  const [width, setWidth] = useState(0);
  const onResize = useCallback((next: number) => setWidth(next), []);
  const perBucket = width > 0 && bucketCount > 0 ? width / bucketCount : 0;
  const needed = longestLabel * GLYPH_PX + GAP_PX;
  const step = perBucket > 0 ? Math.max(1, Math.ceil(needed / perBucket)) : 0;
  return { step, onResize };
}

/**
 * Which buckets get a label: the ones with a value, at least `step` apart.
 * Walking the data rather than sampling every nth index means a run of empty
 * days never swallows the labels of the busy ones beside it.
 */
export function labelledIndices(
  values: readonly (number | null | undefined)[],
  step: number,
): Set<number> {
  const picked = new Set<number>();
  if (step === 0) return picked;
  let last = -Infinity;
  values.forEach((value, index) => {
    if (!value || index - last < step) return;
    picked.add(index);
    last = index;
  });
  return picked;
}

/**
 * A `LabelList` content renderer: the value, whole numbers only, centred above
 * its bar or point. Zero and empty buckets stay unlabelled — a "0" over every
 * empty day is noise, and the gridline already says zero.
 */
export function valueLabel(
  format: (value: number) => string,
  show: Set<number>,
  offset = 6,
) {
  return function ValueLabel({
    viewBox,
    value,
    index,
  }: LabelProps): ReactElement | null {
    if (index === undefined || !show.has(index)) return null;
    if (typeof value !== "number" || value === 0) return null;
    if (!viewBox || !("width" in viewBox)) return null;
    const { x = 0, y = 0, width = 0 } = viewBox;
    return (
      <text
        x={x + width / 2}
        y={y - offset}
        textAnchor="middle"
        fill="var(--color-ink-secondary)"
        fontSize={LABEL_FONT_SIZE}
        // A halo in the card's own colour, so a label the line runs through
        // stays legible without hiding the line.
        stroke="var(--color-surface)"
        strokeWidth={3}
        paintOrder="stroke"
        className="pointer-events-none tabular-nums"
      >
        {format(value)}
      </text>
    );
  };
}
