"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartScroller } from "@/components/charts/ChartScroller";
import { formatDate } from "@/lib/dates";
import { stockTrend, type StockCountRow } from "@/lib/stock";

/**
 * The counts that stand, oldest first.
 *
 * One point per day counted and **no line filled between them** beyond the
 * segment joining two readings: a stocktake measures a day, and drawing a
 * level line across a fortnight nobody walked would assert that nothing moved,
 * which is the one thing a stock count cannot say. The dots are the evidence;
 * the line is only there to let the eye follow them.
 *
 * `--color-ink`, as the price trend uses for its own single series — **not**
 * `--color-chart-1`, which is shadcn's `var(--chart-1)` indirection and
 * resolves to nothing here. Drawn with it the dots rendered in Recharts'
 * default black and the line did not render at all, which is the same trap
 * Phase 06 recorded when the donut reached for `--color-primary`.
 */
export function StockTrend({ rows }: { rows: StockCountRow[] }) {
  const points = stockTrend(rows);

  if (points.length < 2) {
    return (
      <p className="py-md text-[length:var(--text-caption)] text-ink-tertiary">
        {points.length === 0
          ? "No counts yet."
          : "One count so far — a trend needs a second."}
      </p>
    );
  }

  return (
    <ChartScroller buckets={points.length} axisWidth={56}>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--color-hairline)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              tick={{ fontSize: 11, fill: "var(--color-ink-tertiary)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-hairline)" }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--color-ink-tertiary)" }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              formatter={(value) => [
                `${Number(value).toLocaleString("en-MY")} cartons`,
                "Counted",
              ]}
              labelFormatter={(value) => formatDate(String(value))}
              contentStyle={{
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--color-hairline)",
                fontSize: 12,
              }}
            />
            <Line
              type="linear"
              dataKey="cartons"
              stroke="var(--color-ink)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-ink)" }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartScroller>
  );
}
