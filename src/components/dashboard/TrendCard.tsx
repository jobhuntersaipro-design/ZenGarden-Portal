"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { StagePoint } from "@/lib/analytics/fulfillment";
import type { SalesSeries } from "@/lib/analytics/sales";
import { SalesLineChart } from "@/components/dashboard/SalesLineChart";
import { StackedStageChart } from "@/components/dashboard/StackedStageChart";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { formatMYR } from "@/lib/money";
import { usePendingChoice } from "@/hooks/usePendingChoice";

export type Trend = "fulfillment" | "sales";

/**
 * One card, two datasets, and only ever one chart on screen. Fulfillment is the
 * default: this is an ops tool, and where the orders stand is the more useful
 * daily question than what they were worth.
 */
export function TrendCard({
  trend,
  sales,
  stages,
  agg,
  openCount,
  confirmedCount,
  aggLabel,
}: {
  trend: Trend;
  sales: SalesSeries;
  stages: StagePoint[];
  agg: string;
  openCount: number;
  confirmedCount: number;
  aggLabel: string;
}) {
  const trends = usePendingChoice<Trend>(trend);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: Trend) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", next);
    trends.choose(next, `${pathname}?${params.toString()}`);
  };

  // Both series are already here, so the switch is drawn from the click —
  // the URL write behind it only keeps the choice shareable.
  const fulfillment = trends.value !== "sales";

  return (
    <section className="rounded-xl bg-surface p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {fulfillment ? "Fulfillment trend" : "Sales over time"}
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {fulfillment
              ? `${openCount} of ${confirmedCount} confirmed orders still open`
              : `${formatMYR(sales.total.toFixed(2))} across ${sales.points.length} ${aggLabel}`}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            {fulfillment
              ? "Where each period's orders stand today · hover a bar for the split"
              : "Totals per period · hover a point for the value"}
          </p>
        </div>

        <div
          className="flex overflow-hidden rounded-sm border border-hairline"
          aria-busy={trends.pending || undefined}
        >
          {(
            [
              ["fulfillment", "Fulfillment"],
              ["sales", "Sales"],
            ] as const
          ).map(([value, label]) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={fulfillment === (value === "fulfillment")}
              pending={trends.isPending(value)}
              dimmed={trends.pending && !trends.isPending(value)}
              onClick={() => select(value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div className="mt-lg">
        {fulfillment ? (
          <StackedStageChart points={stages} />
        ) : (
          <SalesLineChart series={sales} agg={agg} />
        )}
      </div>
    </section>
  );
}
