"use client";

import {
  Bar,
  CartesianGrid,
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
  // The label line rides along in the payload as "total"; only stages count.
  const stages = payload.filter((entry) =>
    (PO_STAGES as readonly string[]).includes(String(entry.dataKey)),
  );
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
export function StackedStageChart({ points }: { points: StagePoint[] }) {
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
  const top = STACK_ORDER.length - 1;

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
            data={points}
            barCategoryGap={dense ? 1 : 2}
            margin={{ top: 16 }}
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
            <Tooltip
              cursor={{ fill: "var(--color-surface-soft)" }}
              content={<StageTooltip />}
            />
            {STACK_ORDER.map((stage, index) => (
              <Bar
                key={stage}
                dataKey={stage}
                stackId="a"
                fill={colorFor(stage)}
                {...CHART_ANIMATION}
                // A 2px surface gap keeps adjacent fills apart, which is what
                // discharges the CVD warning on the pink/aqua pair.
                stroke="var(--color-canvas)"
                strokeWidth={dense ? 1 : 2}
                // Only the topmost segment is rounded.
                radius={index === top ? [3, 3, 0, 0] : undefined}
              />
            ))}
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
