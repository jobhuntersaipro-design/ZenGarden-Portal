"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@/lib/analytics/products";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";
import {
  CHART_ANIMATION,
  LABEL_FONT_SIZE,
  labelledIndices,
  useLabelStep,
  valueLabel,
} from "@/components/charts/labels";
import { ChartScroller } from "@/components/charts/ChartScroller";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { usePendingChoice } from "@/hooks/usePendingChoice";

export type TrendMode = "price" | "units";

function TrendTooltip({
  active,
  payload,
  label,
  mode,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  mode: TrendMode;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-md bg-ink p-sm text-canvas shadow-sm">
      <p className="text-[length:var(--text-caption)]">
        {label} —{" "}
        {value === null || value === undefined
          ? "no sales"
          : mode === "price"
            ? formatMYR(Number(value).toFixed(2))
            : `${Math.round(Number(value))} units`}
      </p>
    </div>
  );
}

export function PriceTrendChart({
  points,
  listPrice,
  mode,
}: {
  points: PricePoint[];
  listPrice: number;
  mode: TrendMode;
}) {
  const modes = usePendingChoice<TrendMode>(mode);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: TrendMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", next);
    modes.choose(next, `${pathname}?${params.toString()}`);
  };

  const sold = points.filter((point) => point.avgBilled !== null);
  const format = (value: number) =>
    mode === "price" ? formatMYR(value, 0) : formatUnits(value);
  const longest = sold.reduce(
    (max, point) =>
      Math.max(
        max,
        format(mode === "price" ? (point.avgBilled ?? 0) : point.units).length,
      ),
    0,
  );
  const labels = useLabelStep(points.length, longest);
  const labelled = labelledIndices(
    points.map((point) => (mode === "price" ? point.avgBilled : point.units)),
    labels.step,
  );
  const first = sold[0]?.avgBilled ?? null;
  const last = sold[sold.length - 1]?.avgBilled ?? null;

  return (
    <section className="rounded-xl bg-surface p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Price trend
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {first !== null && last !== null
              ? `${formatMYR(first.toFixed(2))} → ${formatMYR(last.toFixed(2))} over 12 months`
              : "No sales in the last 12 months"}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            Months with no sales leave a gap · tap or hover a point for the
            value
          </p>
        </div>

        <SegmentGroup label="Measure" hideLabel busy={modes.pending}>
          {(
            [
              ["price", "Avg unit price"],
              ["units", "Units sold"],
            ] as const
          ).map(([value, label]) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={modes.value === value}
              pending={modes.isPending(value)}
              dimmed={modes.pending && !modes.isPending(value)}
              onClick={() => select(value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </SegmentGroup>
      </div>

      <ChartScroller
        buckets={points.length}
        labels={points.map((point) => point.label)}
        axisWidth={128}
        fade="surface"
        className="mt-lg"
      >
        <div className="h-72 w-full">
          <ResponsiveContainer onResize={labels.onResize}>
            <LineChart data={points} margin={{ top: 16, right: 16 }}>
              <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                padding={{ left: 24, right: 24 }}
                tick={{
                  fill: "var(--color-ink-tertiary)",
                  fontSize: LABEL_FONT_SIZE,
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{
                  fill: "var(--color-ink-tertiary)",
                  fontSize: LABEL_FONT_SIZE,
                }}
              />
              <Tooltip content={<TrendTooltip mode={mode} />} />
              {/* Discounting reads as the gap between the line and the dash. */}
              {mode === "price" ? (
                <ReferenceLine
                  y={listPrice}
                  stroke="var(--color-brand-link)"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: `List ${formatMYR(listPrice.toFixed(2))}`,
                    // Inside the plot: "right" hangs the text past the svg edge.
                    position: "insideBottomRight",
                    fill: "var(--color-ink-tertiary)",
                    fontSize: LABEL_FONT_SIZE,
                  }}
                />
              ) : null}
              <Line
                type="linear"
                dataKey={mode === "price" ? "avgBilled" : "units"}
                stroke="var(--color-ink)"
                strokeWidth={2}
                {...CHART_ANIMATION}
                // A month with no sales is a gap, not a drop to zero.
                connectNulls={false}
                dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              >
                {/* Whole ringgit or whole units; a gap month has no label. */}
                <LabelList
                  dataKey={mode === "price" ? "avgBilled" : "units"}
                  content={valueLabel(format, labelled, 10)}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartScroller>
    </section>
  );
}
