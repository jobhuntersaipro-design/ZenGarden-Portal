"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PoStage } from "@/generated/prisma/enums";
import type { StagePoint } from "@/lib/analytics/fulfillment";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";
import { STAGE_VARS, cssVar } from "@/lib/analytics/palette";
import {
  axisInterval,
  CHART_ANIMATION,
  LABEL_FONT_SIZE,
  labelledIndices,
  useLabelStep,
  valueLabel,
} from "@/components/charts/labels";
import { ChartScroller } from "@/components/charts/ChartScroller";

/** Delivered at the bottom, Order placed on top (design reference §3.2). */
const STACK_ORDER = [...PO_STAGES].reverse();

const colorFor = (stage: PoStage) =>
  cssVar(STAGE_VARS[PO_STAGES.indexOf(stage)]);

/**
 * A point, optionally carrying the late share of each of its stages.
 *
 * Optional because the dashboard's own card draws the same chart from a plain
 * `StagePoint`; where `late` is absent every segment is solid, which is the
 * truthful drawing of a series that was never asked about lateness.
 */
type ChartPoint = StagePoint & { late?: Record<PoStage, number> };

/**
 * Each stage becomes two stacked bars — the late share, then the rest — so
 * one band of the stage's own colour carries both. The hatch says *late*; the
 * colour still says *which stage*, which is what keeps an overdue order
 * readable at the stage it is actually stuck at rather than bundled at the
 * foot of the bar with every other late order.
 */
const LATE = (stage: PoStage) => `${stage}__late`;
const ON_TIME = (stage: PoStage) => `${stage}__on`;
const hatchId = (stage: PoStage) => `stage-hatch-${PO_STAGES.indexOf(stage)}`;

function splitRows(points: ChartPoint[]) {
  return points.map((point) => {
    const row: Record<string, string | number> = {
      key: point.key,
      label: point.label,
      total: point.total,
    };
    for (const stage of PO_STAGES) {
      const late = point.late?.[stage] ?? 0;
      row[LATE(stage)] = late;
      row[ON_TIME(stage)] = point[stage] - late;
    }
    return row;
  });
}

function StageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  // The label line rides along in the payload as "total"; only stages count,
  // and each arrives as its late half and its on-time half.
  const byStage = new Map<string, number>();
  for (const entry of payload) {
    const [stage, half] = String(entry.dataKey).split("__");
    if (!half || !(PO_STAGES as readonly string[]).includes(stage)) continue;
    byStage.set(stage, (byStage.get(stage) ?? 0) + (entry.value ?? 0));
  }
  const stages = [...byStage].map(([dataKey, value]) => ({ dataKey, value }));
  const total = stages.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  return (
    <div className="rounded-md bg-ink p-sm text-canvas shadow-sm">
      <p className="text-[length:var(--text-caption)] font-medium">
        {label} · {total} confirmed
      </p>
      {stages
        .filter((entry) => (entry.value ?? 0) > 0)
        .map((entry) => (
          <p
            key={String(entry.dataKey)}
            className="text-[length:var(--text-caption)]"
          >
            {stageLabel(entry.dataKey as PoStage)}: {entry.value}
          </p>
        ))}
    </div>
  );
}

/**
 * One bar per bucket, segments = the current stage of that bucket's confirmed
 * orders, the bucket's total above it. The y axis is order count, not money —
 * this chart answers throughput, and mixing a money scale in would be the
 * dual-axis mistake. The legend is the stage bar the card renders below.
 */
export function StackedStageChart({
  points,
  onActive,
  onPick,
  activeKey = null,
  stages = STACK_ORDER,
  showTooltip = true,
}: {
  points: ChartPoint[];
  /**
   * The bucket under the pointer, or null once it leaves. Given so a card can
   * open the bar's own breakdown below the chart; the chart itself keeps no
   * state, because the card has to be able to pin a bucket on a tap and the
   * two would then disagree.
   */
  onActive?: (key: string | null) => void;
  /**
   * The bucket that was clicked. A phone has no hover, so a tap is how a bar
   * is chosen there — and on a desktop it is how a reader stops the
   * breakdown moving while they read it.
   */
  onPick?: (key: string) => void;
  /**
   * The bucket the reader is on. The bars beside it fade, because a
   * breakdown below the chart is unreadable if you cannot tell which bar it
   * belongs to — hovering moved the table and left the plot unchanged
   * (measured 2026-09-22).
   */
  activeKey?: string | null;
  /**
   * Which stages to stack, bottom first. The stage board passes the five open
   * ones: a delivered order has left its snapshot, so that segment would be a
   * permanent zero.
   */
  stages?: readonly PoStage[];
  /**
   * Off where something below the chart already answers what a bar is made
   * of — two explanations of one bar, one of them following the pointer, is
   * noise rather than depth.
   */
  showTooltip?: boolean;
}) {
  const longest = points.reduce(
    (max, point) => Math.max(max, String(point.total).length),
    0,
  );
  const labels = useLabelStep(points.length, longest);
  const labelled = labelledIndices(
    points.map((point) => point.total),
    labels.step,
  );

  if (points.every((point) => point.total === 0)) {
    return (
      <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
        No confirmed purchase orders in this range.
      </p>
    );
  }

  const dense = points.length > 60;
  const top = stages.length - 1;
  const rows = splitRows(points);

  return (
    // Bars need at least as much room per bucket as a line does; below that
    // the stack becomes a smear (2026-09-06 review, A1).
    <ChartScroller
      buckets={points.length}
      labels={points.map((point) => point.label)}
      axisWidth={96}
      fade="surface"
    >
      <div className="h-72 w-full">
        <ResponsiveContainer onResize={labels.onResize}>
          {/* Room above the tallest bar for its label. */}
          <ComposedChart
            data={rows}
            barCategoryGap={dense ? 1 : 2}
            margin={{ top: 16 }}
            onMouseMove={
              onActive
                ? (state) => {
                    // Recharts types the index as number | string | null —
                    // a categorical axis can key on the label itself — and
                    // `Number(null)` is 0, which would pin the first bar
                    // every time the pointer left the plot. Refuse the
                    // nullish case before converting.
                    const raw = state?.activeTooltipIndex;
                    if (raw === null || raw === undefined) return onActive(null);
                    const index = Number(raw);
                    onActive(
                      Number.isInteger(index)
                        ? (points[index]?.key ?? null)
                        : null,
                    );
                  }
                : undefined
            }
            onMouseLeave={onActive ? () => onActive(null) : undefined}
            className={onPick ? "cursor-pointer" : undefined}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-hairline)"
              strokeDasharray="0"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={axisInterval(points.length)}
              tick={{
                fill: "var(--color-ink-tertiary)",
                fontSize: LABEL_FONT_SIZE,
              }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={{
                fill: "var(--color-ink-tertiary)",
                fontSize: LABEL_FONT_SIZE,
              }}
            />
            {showTooltip ? (
              <Tooltip
                cursor={{ fill: "var(--color-surface-soft)" }}
                content={<StageTooltip />}
              />
            ) : (
              // Kept for the cursor alone: without a Tooltip there is no
              // active index, so nothing to hand to `onActive`.
              <Tooltip
                cursor={{ fill: "var(--color-surface-soft)" }}
                content={() => null}
              />
            )}
            {/* One hatch per stage, in that stage's own colour. Recharts
                renders a `defs` child as-is, which is how its own gradient
                examples work. */}
            <defs>
              {stages.map((stage) => (
                <pattern
                  key={stage}
                  id={hatchId(stage)}
                  width="6"
                  height="6"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect
                    width="6"
                    height="6"
                    fill={colorFor(stage)}
                    fillOpacity={0.35}
                  />
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="6"
                    stroke={colorFor(stage)}
                    strokeWidth="3"
                  />
                </pattern>
              ))}
            </defs>
            {stages.flatMap((stage, index) =>
              // Late first, so it sits at the foot of its own stage's band
              // and the top of the bar stays the on-time segment — which is
              // what lets the rounded cap stay where the canvas puts it.
              ([LATE(stage), ON_TIME(stage)] as const).map((dataKey) => (
                <Bar
                  key={dataKey}
                  dataKey={dataKey}
                  stackId="a"
                  fill={
                    dataKey === LATE(stage)
                      ? `url(#${hatchId(stage)})`
                      : colorFor(stage)
                  }
                  {...CHART_ANIMATION}
                  // A 2px surface gap keeps adjacent fills apart, which is what
                  // discharges the CVD warning on the pink/aqua pair. The two
                  // halves of one stage are not separated: they are one band.
                  stroke="var(--color-canvas)"
                  strokeWidth={dataKey === LATE(stage) ? 0 : dense ? 1 : 2}
                  // On the bar, not on the chart: a chart-level click reads
                  // Recharts' own active index, which lags the mousemove that
                  // preceded it and which a tap outruns entirely — measured
                  // failing at 390 and at 1440. A segment carries its own
                  // datum and needs no hover to have happened.
                  onClick={
                    onPick
                      ? (entry: { payload?: { key?: string } }) => {
                          const key = entry?.payload?.key;
                          if (key) onPick(key);
                        }
                      : undefined
                  }
                  // Only the topmost segment is rounded.
                  radius={
                    index === top && dataKey === ON_TIME(stage)
                      ? [3, 3, 0, 0]
                      : undefined
                  }
                >
                  {/* The bars beside the active one fade. Without it, hovering
                      moves the breakdown below and leaves the plot unchanged,
                      so nothing on screen says which bar is being read
                      (measured 2026-09-22). */}
                  {activeKey
                    ? points.map((point) => (
                        <Cell
                          key={point.key}
                          fillOpacity={point.key === activeKey ? 1 : 0.25}
                        />
                      ))
                    : null}
                </Bar>
              )),
            )}
            {/* An invisible line at each bucket's total carries the label: a
              LabelList on the top segment goes missing wherever that segment
              is zero, and every segment is zero somewhere. */}
            <Line
              dataKey="total"
              stroke="none"
              dot={false}
              activeDot={false}
              {...CHART_ANIMATION}
            >
              <LabelList
                dataKey="total"
                content={valueLabel(String, labelled)}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartScroller>
  );
}
