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

/**
 * How many buckets an x-axis skips between the ticks it prints — at most
 * twelve labels, however many buckets there are. Shared so `ChartScroller` can
 * size the plot from the labels that will actually be drawn rather than from a
 * formula that has drifted out of step with the axis.
 */
export function axisInterval(bucketCount: number): number {
  return Math.max(0, Math.ceil(bucketCount / 12) - 1);
}

/** How many ticks that interval leaves on screen. */
export function shownTickCount(bucketCount: number): number {
  return Math.ceil(bucketCount / (axisInterval(bucketCount) + 1));
}

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
 * Which buckets each series labels, when several are drawn on one chart.
 *
 * `step` is the spacing one series needs so its own labels do not overlap.
 * With several series that is not enough: two lines labelling the *same*
 * bucket print at the same x, and a browser drive caught exactly that at
 * three markets over thirty daily buckets — `RM 5,206` printed over
 * `RM 5,183`. Turning the labels off (what the dashboard did) answered it by
 * giving up the figures.
 *
 * So the buckets are shared out rather than each series claiming them all:
 * one walk over the buckets, `step` apart, handing each label slot to the
 * next series in turn. Two consequences fall out of that and they are the
 * whole design.
 *
 * - **At most one label per bucket**, so no two can share an x and the
 *   vertical distance between lines never matters — no y scale is needed to
 *   place a label safely.
 * - **Any two labels on the chart are `step` apart**, whichever series they
 *   belong to, which is the spacing `useLabelStep` measured the width for.
 *
 * Whoever's turn it is passes when they have nothing to print in that bucket,
 * so a series resting at zero does not spend a slot its neighbour could use;
 * a bucket where *every* series is empty is skipped without spending the
 * spacing at all, which is what keeps a run of quiet days from swallowing the
 * labels of the busy ones beside it.
 *
 * The cost, stated rather than hidden: a reader gets one figure per bucket,
 * not one per line. Four series over thirty buckets is 120 figures and a
 * 288px-tall plot holds about 18 rows of 12px text, so printing them all was
 * never available — the tooltip is still what answers a specific point.
 *
 * Order matters and is the caller's: series are offered slots in the order
 * they are passed, which is slot order in `SeriesTrend`, so the assignment is
 * stable across renders rather than following whatever the data did.
 */
export function rotateSeriesLabels(
  series: readonly {
    key: string;
    values: readonly (number | null | undefined)[];
  }[],
  step: number,
): Map<string, Set<number>> {
  const picked = new Map<string, Set<number>>(
    series.map((one) => [one.key, new Set<number>()]),
  );
  if (step === 0 || series.length === 0) return picked;

  const bucketCount = series.reduce(
    (max, one) => Math.max(max, one.values.length),
    0,
  );
  let last = -Infinity;
  let turn = 0;

  for (let index = 0; index < bucketCount; index += 1) {
    if (index - last < step) continue;
    for (let offset = 0; offset < series.length; offset += 1) {
      const candidate = (turn + offset) % series.length;
      const value = series[candidate].values[index];
      // A zero is not a label — the gridline already says zero, and a "0"
      // over every quiet day is noise. Pass the slot on instead of burning it.
      if (!value) continue;
      picked.get(series[candidate].key)!.add(index);
      last = index;
      turn = (candidate + 1) % series.length;
      break;
    }
  }

  return picked;
}

/**
 * Which buckets get a label on a chart drawing one series: the ones with a
 * value, at least `step` apart.
 *
 * The one-series case of `rotateSeriesLabels` rather than a second copy of
 * the walk, so the four charts that draw a single line and the two that draw
 * several cannot drift apart on what "far enough apart" means.
 */
export function labelledIndices(
  values: readonly (number | null | undefined)[],
  step: number,
): Set<number> {
  return rotateSeriesLabels([{ key: "only", values }], step).get("only")!;
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

/**
 * Which points a line chart labels: the biggest first. A walk from the left
 * (`rotateSeriesLabels`) spends its slots on whatever comes first, so on a
 * phone a quiet day on the 1st took the slot the month's peak needed, and the
 * one figure a reader looks for went unprinted. Here each series offers its
 * points largest first and the series take turns, so every line gets its own
 * peaks; a point is taken only if it is `step` buckets from every point
 * already taken, which keeps one label per bucket and none overlapping.
 * Zeros are never labelled — the baseline already says zero.
 */
export function peakLabels(
  series: readonly {
    key: string;
    values: readonly (number | null | undefined)[];
  }[],
  step: number,
): Map<string, Set<number>> {
  const picked = new Map<string, Set<number>>(
    series.map((one) => [one.key, new Set<number>()]),
  );
  if (step === 0) return picked;
  const queues = series.map((one) =>
    one.values
      .map((value, index) => ({ index, value: value ?? 0 }))
      .filter((point) => point.value !== 0)
      .sort((a, b) => b.value - a.value || a.index - b.index),
  );
  const taken: number[] = [];
  const free = (index: number) => taken.every((at) => Math.abs(at - index) >= step);
  for (let progress = true; progress; ) {
    progress = false;
    queues.forEach((queue, at) => {
      while (queue.length > 0 && !free(queue[0].index)) queue.shift();
      const next = queue.shift();
      if (!next) return;
      taken.push(next.index);
      picked.get(series[at].key)!.add(next.index);
      progress = true;
    });
  }
  return picked;
}

/**
 * The `pointLabels` callback Arc's line chart takes: given the plot's width,
 * which points print their figure, spaced from the longest figure so no two
 * meet (the same measure `useLabelStep` uses for the bar charts).
 */
export function pointLabelPicker(
  series: readonly { key: string; values: readonly number[] }[],
  format: (value: number) => string,
) {
  return (plotWidth: number) => {
    const buckets = series.reduce((max, one) => Math.max(max, one.values.length), 0);
    if (buckets === 0 || plotWidth <= 0) return [];
    const longest = series.reduce(
      (max, one) =>
        one.values.reduce((m, value) => (value ? Math.max(m, format(value).length) : m), max),
      0,
    );
    const perBucket = plotWidth / Math.max(1, buckets - 1);
    const step = Math.max(1, Math.ceil((longest * GLYPH_PX + GAP_PX) / perBucket));
    const picked = peakLabels(series, step);
    return series.flatMap((one) =>
      [...(picked.get(one.key) ?? [])].map((index) => ({
        index,
        series: one.key,
        text: format(one.values[index]),
      })),
    );
  };
}
