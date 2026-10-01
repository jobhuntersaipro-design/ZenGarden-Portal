"use client";

import {
  pickMeasure,
  type SalesMeasure,
  type SalesSeries,
} from "@/lib/analytics/sales";
import { LineChart } from "@/components/arc/line-chart/line-chart";
import { pointLabelPicker } from "@/components/charts/labels";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";

/** The exact figure, for the crosshair readout. */
const formatExact = (measure: SalesMeasure, value: number) =>
  measure === "sales"
    ? formatMYR(value.toFixed(2))
    : `${formatUnits(value)} units`;

/** The figure printed beside a point: whole numbers, read at a glance. */
const formatLabel = (measure: SalesMeasure, value: number) =>
  measure === "sales" ? formatMYR(value, 0) : formatUnits(Math.round(value));

/**
 * Sales or units over the range as Arc's line chart — a crosshair readout, a
 * morphing path when the range changes and a screen-reader table. One series,
 * so no legend, and one axis, always — money or units, never both.
 */
export function SalesLineChart({
  series,
  measure = "sales",
}: {
  series: SalesSeries;
  measure?: SalesMeasure;
}) {
  const picked = pickMeasure(series, measure);

  if (series.count === 0) {
    return (
      <p className="py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
        No purchase orders in this range.
      </p>
    );
  }

  // The axis labels about eight buckets, whatever the range.
  const every = Math.max(1, Math.ceil(picked.points.length / 8));
  return (
    <LineChart
      label={measure === "sales" ? "Sales" : "Units"}
      categoryLabel="Period"
      height={288}
      legend={false}
      series={[{ key: "value", label: measure === "sales" ? "Sales" : "Units", area: true }]}
      data={picked.points.map((point, index) => ({
        key: point.key,
        label: point.label,
        axisLabel: index % every === 0 ? point.label : undefined,
        values: { value: point.value },
      }))}
      formatValue={(value) => formatExact(measure, value)}
      pointLabels={pointLabelPicker(
        [{ key: "value", values: picked.points.map((point) => point.value) }],
        (value) => formatLabel(measure, value),
      )}
      formatTick={(value) =>
        measure === "sales"
          ? `RM ${Intl.NumberFormat("en", { notation: "compact" }).format(value)}`
          : Intl.NumberFormat("en", { notation: "compact" }).format(value)
      }
    />
  );
}
