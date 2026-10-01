"use client";

import { LineChart } from "@/components/arc/line-chart/line-chart";
import { pointLabelPicker } from "@/components/charts/labels";
import { formatDate } from "@/lib/dates";
import { stockTrend, type StockCountRow } from "@/lib/stock";
import { plural } from "@/lib/plural";

/**
 * The counts that stand, oldest first.
 *
 * One point per day counted and **no line filled between them** beyond the
 * segment joining two readings: a stocktake measures a day, and drawing a
 * level line across a fortnight nobody walked would assert that nothing moved,
 * which is the one thing a stock count cannot say. The dots are the evidence;
 * the line is only there to let the eye follow them.
 *
 * Arc's line chart, straight segments, with one point per count day — the
 * points are evenly spaced, so the axis names each day rather than implying
 * a calendar scale.
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

  const every = Math.max(1, Math.ceil(points.length / 6));
  return (
    <LineChart
      label="Cartons counted"
      categoryLabel="Counted on"
      height={224}
      curve="linear"
      legend={false}
      series={[{ key: "cartons", label: "Counted", area: true }]}
      data={points.map((point, index) => ({
        key: point.date,
        label: formatDate(point.date),
        axisLabel: index % every === 0 ? formatDate(point.date) : undefined,
        values: { cartons: point.cartons },
      }))}
      formatValue={(value) => plural(value, "carton")}
      pointLabels={pointLabelPicker(
        [{ key: "cartons", values: points.map((point) => point.cartons) }],
        (value) => Intl.NumberFormat("en").format(value),
      )}
      formatTick={(value) => Intl.NumberFormat("en").format(Math.round(value))}
    />
  );
}
