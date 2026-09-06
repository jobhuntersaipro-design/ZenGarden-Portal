"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  pickMeasure,
  type SalesMeasure,
  type SalesSeries,
} from "@/lib/analytics/sales";
import { EXTREME_VAR, cssVar } from "@/lib/analytics/palette";
import {
  CHART_ANIMATION,
  LABEL_FONT_SIZE,
  labelledIndices,
  useLabelStep,
  valueLabel,
} from "@/components/charts/labels";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";

const UNIT: Record<string, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
};

/** The exact figure, for the tooltip, the average and the legend. */
const formatExact = (measure: SalesMeasure, value: number) =>
  measure === "sales" ? formatMYR(value.toFixed(2)) : `${formatUnits(value)} units`;

/** The rounded figure, for the label beside a point. */
const formatLabel = (measure: SalesMeasure) => (value: number) =>
  measure === "sales" ? formatMYR(value, 0) : formatUnits(value);

function SalesTooltip({
  active,
  payload,
  label,
  measure,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  measure: SalesMeasure;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-ink p-sm text-canvas shadow-sm">
      <p className="text-[length:var(--text-caption)]">
        {label} — {formatExact(measure, payload[0].value ?? 0)}
      </p>
    </div>
  );
}

/**
 * Single hue (`ink`) with `primary` reserved for the two extremes and
 * `brand-link` for the average, so colour on this chart means "notable", not
 * "another series". One axis, always — money or units, never both.
 */
export function SalesLineChart({
  series,
  measure = "sales",
  agg,
}: {
  series: SalesSeries;
  measure?: SalesMeasure;
  agg: string;
}) {
  const picked = pickMeasure(series, measure);
  const format = formatLabel(measure);
  const longest = picked.points.reduce(
    (max, point) => Math.max(max, format(point.value).length),
    0,
  );
  const labels = useLabelStep(picked.points.length, longest);
  const labelled = labelledIndices(
    picked.points.map((point) => point.value),
    labels.step,
  );

  if (series.count === 0) {
    return (
      <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
        No purchase orders in this range.
      </p>
    );
  }

  const dense = picked.points.length > 60;
  // Labels sit above the max point, so the plot needs room not to clip them.
  const headroom = (picked.max?.value ?? 0) * 1.12;
  // One bucket, or a flat series, has no meaningful extremes to mark.
  const showExtremes =
    picked.points.length > 1 && picked.max?.value !== picked.min?.value;
  const unit = UNIT[agg] ?? agg;

  return (
    <>
      <div className="h-72 w-full">
        <ResponsiveContainer onResize={labels.onResize}>
          {/* The end points sit off the plot edges so their labels do not
              run into the y axis or the card. */}
          <ComposedChart data={picked.points} margin={{ top: 16, right: 16 }}>
            <defs>
              <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.06} />
                <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              padding={{ left: 40, right: 24 }}
              interval={Math.max(0, Math.ceil(picked.points.length / 12) - 1)}
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: LABEL_FONT_SIZE }}
            />
            <YAxis
              domain={[0, headroom || "auto"]}
              tickLine={false}
              axisLine={false}
              width={64}
              // The headroom tick is a float (832 × 1.12), so round it.
              tickFormatter={(value: number) =>
                value >= 1000
                  ? `${Math.round(value / 1000)}k`
                  : String(Math.round(value))
              }
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: LABEL_FONT_SIZE }}
            />
            <Tooltip content={<SalesTooltip measure={measure} />} />
            <Area
              type="linear"
              dataKey="value"
              stroke="none"
              fill="url(#salesFill)"
              {...CHART_ANIMATION}
            />
            <ReferenceLine
              y={picked.average}
              stroke="var(--color-brand-link)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: `Avg ${formatExact(measure, picked.average)} per ${unit}`,
                // Inside the plot: "right" hangs the text past the svg edge.
                position: "insideTopRight",
                fill: "var(--color-ink-tertiary)",
                fontSize: LABEL_FONT_SIZE,
              }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--color-ink)"
              strokeWidth={2}
              {...CHART_ANIMATION}
              dot={
                dense
                  ? false
                  : (props: { cx?: number; cy?: number; payload?: { key: string } }) => {
                      const extreme =
                        showExtremes &&
                        (props.payload?.key === picked.max?.key ||
                          props.payload?.key === picked.min?.key);
                      return (
                        <circle
                          key={props.payload?.key}
                          cx={props.cx}
                          cy={props.cy}
                          r={extreme ? 5 : 4}
                          fill={
                            extreme ? cssVar(EXTREME_VAR) : "var(--color-ink)"
                          }
                          stroke="var(--color-canvas)"
                          strokeWidth={2}
                        />
                      );
                    }
              }
            >
              {/* Whole figures only; the exact value is a hover away. */}
              <LabelList dataKey="value" content={valueLabel(format, labelled, 10)} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-md flex flex-wrap gap-md">
        <li className="flex items-center gap-xxs">
          <span aria-hidden className="h-0.5 w-4 bg-ink" />
          <span className="text-[length:var(--text-caption)] text-ink-secondary">
            {measure === "sales" ? "Sales" : "Units"}
          </span>
        </li>
        <li className="flex items-center gap-xxs">
          <span
            aria-hidden
            className="h-0.5 w-4 border-t-2 border-dashed border-brand-link"
          />
          <span className="text-[length:var(--text-caption)] text-ink-secondary">
            Average per {unit}
          </span>
        </li>
        {showExtremes ? (
          <li className="flex items-center gap-xxs">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: cssVar(EXTREME_VAR) }}
            />
            <span className="text-[length:var(--text-caption)] text-ink-secondary">
              Max {formatExact(measure, picked.max?.value ?? 0)} · Min{" "}
              {formatExact(measure, picked.min?.value ?? 0)}
            </span>
          </li>
        ) : null}
      </ul>
    </>
  );
}
