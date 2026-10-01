"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { PricePoint } from "@/lib/analytics/products";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";
import { LineChart } from "@/components/arc/line-chart/line-chart";
import { pointLabelPicker } from "@/components/charts/labels";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { usePendingChoice } from "@/hooks/usePendingChoice";

export type TrendMode = "price" | "units";

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
  const first = sold[0]?.avgBilled ?? null;
  const last = sold[sold.length - 1]?.avgBilled ?? null;

  // A month with no sales is left off the price line rather than drawn as a
  // drop to zero: Arc's chart reads a missing value as 0, and an average price
  // of nothing is not RM 0. Units sold are a real zero, so every month stays.
  const plotted = mode === "price" ? sold : points;
  const every = Math.max(1, Math.ceil(plotted.length / 6));
  const data = plotted.map((point, index) => ({
    key: point.key,
    label: point.label,
    axisLabel: index % every === 0 ? point.label : undefined,
    values:
      mode === "price"
        ? { value: point.avgBilled ?? 0, list: listPrice }
        : { value: point.units },
  }));

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
            {mode === "price"
              ? "Months with no sales are left out · tap or hover for the value"
              : "Tap or hover a month for the value"}
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

      <div className="mt-lg">
        <LineChart
          label={mode === "price" ? "Average unit price" : "Units sold"}
          categoryLabel="Month"
          height={288}
          curve="linear"
          legend={mode === "price"}
          series={
            mode === "price"
              ? [
                  { key: "value", label: "Avg unit price", area: true },
                  // Discounting reads as the gap between the line and the dash.
                  { key: "list", label: "List price", dashed: true, area: false },
                ]
              : [{ key: "value", label: "Units sold", area: true }]
          }
          data={data}
          emptyLabel="No sales in the last 12 months"
          // The list price is one figure, already named by its dashed line;
          // only the billed line prints its points. A price keeps its cents.
          pointLabels={pointLabelPicker(
            [{ key: "value", values: data.map((point) => point.values.value) }],
            (value) => (mode === "price" ? formatMYR(value.toFixed(2)) : formatUnits(value)),
          )}
          formatValue={(value) =>
            mode === "price"
              ? formatMYR(value.toFixed(2))
              : `${formatUnits(value)} units`
          }
          formatTick={(value) =>
            mode === "price"
              ? `RM ${Intl.NumberFormat("en", { notation: "compact" }).format(value)}`
              : Intl.NumberFormat("en", { notation: "compact" }).format(value)
          }
        />
      </div>
    </section>
  );
}
