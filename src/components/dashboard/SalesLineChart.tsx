"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SalesSeries } from "@/lib/analytics/sales";
import { EXTREME_VAR, cssVar } from "@/lib/analytics/palette";
import { formatMYR } from "@/lib/money";

const UNIT: Record<string, string> = {
  day: "day",
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
};

function SalesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-ink p-sm text-canvas shadow-sm">
      <p className="text-[length:var(--text-caption)]">
        {label} — {formatMYR((payload[0].value ?? 0).toFixed(2))}
      </p>
    </div>
  );
}

/**
 * Single hue (`ink`) with `primary` reserved for the two extremes and
 * `brand-link` for the average, so colour on this chart means "notable", not
 * "another series". One axis, always.
 */
export function SalesLineChart({
  series,
  agg,
}: {
  series: SalesSeries;
  agg: string;
}) {
  if (series.count === 0) {
    return (
      <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
        No purchase orders in this range.
      </p>
    );
  }

  const dense = series.points.length > 60;
  // Chips sit above the max point, so the plot needs room not to clip them.
  const headroom = (series.max?.total ?? 0) * 1.08;
  // One bucket, or a flat series, has no meaningful extremes to mark.
  const showExtremes =
    series.points.length > 1 && series.max?.total !== series.min?.total;

  return (
    <>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <ComposedChart data={series.points}>
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
              interval={Math.max(0, Math.ceil(series.points.length / 12) - 1)}
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
            />
            <YAxis
              domain={[0, headroom || "auto"]}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
              }
              tick={{ fill: "var(--color-ink-tertiary)", fontSize: 12 }}
            />
            <Tooltip content={<SalesTooltip />} />
            <Area
              type="linear"
              dataKey="total"
              stroke="none"
              fill="url(#salesFill)"
              isAnimationActive={false}
            />
            <ReferenceLine
              y={series.average}
              stroke="var(--color-brand-link)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: `Avg ${formatMYR(series.average.toFixed(2))} per ${UNIT[agg] ?? agg}`,
                position: "right",
                fill: "var(--color-ink-tertiary)",
                fontSize: 12,
              }}
            />
            <Line
              type="linear"
              dataKey="total"
              stroke="var(--color-ink)"
              strokeWidth={2}
              isAnimationActive={false}
              dot={
                dense
                  ? false
                  : (props: { cx?: number; cy?: number; payload?: { key: string } }) => {
                      const extreme =
                        showExtremes &&
                        (props.payload?.key === series.max?.key ||
                          props.payload?.key === series.min?.key);
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
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-md flex flex-wrap gap-md">
        <li className="flex items-center gap-xxs">
          <span aria-hidden className="h-0.5 w-4 bg-ink" />
          <span className="text-[length:var(--text-caption)] text-ink-secondary">
            Sales
          </span>
        </li>
        <li className="flex items-center gap-xxs">
          <span
            aria-hidden
            className="h-0.5 w-4 border-t-2 border-dashed border-brand-link"
          />
          <span className="text-[length:var(--text-caption)] text-ink-secondary">
            Average per {UNIT[agg] ?? agg}
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
              Max {formatMYR((series.max?.total ?? 0).toFixed(2))} · Min{" "}
              {formatMYR((series.min?.total ?? 0).toFixed(2))}
            </span>
          </li>
        ) : null}
      </ul>
    </>
  );
}
