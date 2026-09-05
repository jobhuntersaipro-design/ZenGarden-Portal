"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PoStage } from "@/generated/prisma/enums";
import type { StagePoint } from "@/lib/analytics/fulfillment";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";
import { STAGE_VARS, cssVar } from "@/lib/analytics/palette";

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
  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0);
  return (
    <div className="rounded-md bg-ink p-sm text-canvas shadow-sm">
      <p className="text-[length:var(--text-caption)] font-medium">
        {label} — {total} confirmed
      </p>
      {payload
        .filter((entry) => (entry.value ?? 0) > 0)
        .map((entry) => (
          <p key={String(entry.dataKey)} className="text-[length:var(--text-caption)]">
            {stageLabel(entry.dataKey as PoStage)}: {entry.value}
          </p>
        ))}
    </div>
  );
}

/**
 * One bar per bucket, segments = the current stage of that bucket's confirmed
 * orders. The y axis is order count, not money — this chart answers throughput,
 * and mixing a money scale in would be the dual-axis mistake.
 */
export function StackedStageChart({ points }: { points: StagePoint[] }) {
  if (points.every((point) => point.total === 0)) {
    return (
      <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
        No confirmed purchase orders in this range.
      </p>
    );
  }

  const dense = points.length > 60;

  return (
    <>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={points} barCategoryGap={dense ? 1 : 2}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-hairline)"
              strokeDasharray="0"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={Math.max(0, Math.ceil(points.length / 12) - 1)}
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
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
                // Off, like the line chart. Recharts grows bars from zero over
                // 1.5s, so a screenshot or a PDF export catches an empty plot
                // and reads it as "no data" — the same failure the KPI
                // count-up rule exists to prevent (design reference §3.2).
                isAnimationActive={false}
                // A 2px surface gap keeps adjacent fills apart, which is what
                // discharges the CVD warning on the pink/aqua pair.
                stroke="var(--color-canvas)"
                strokeWidth={dense ? 1 : 2}
                // Only the topmost segment is rounded.
                radius={index === STACK_ORDER.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Six stages in order, always — identity is never colour alone. */}
      <ul className="mt-md flex flex-wrap gap-md">
        {PO_STAGES.map((stage) => (
          <li key={stage} className="flex items-center gap-xxs">
            <span
              aria-hidden
              className="size-2.5 rounded-xxs"
              style={{ backgroundColor: colorFor(stage) }}
            />
            <span className="text-[length:var(--text-caption)] text-ink-secondary">
              {stageLabel(stage)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
