"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { StagePoint } from "@/lib/analytics/fulfillment";
import type { SalesSeries } from "@/lib/analytics/sales";
import { SalesLineChart } from "@/components/dashboard/SalesLineChart";
import { StackedStageChart } from "@/components/dashboard/StackedStageChart";
import { formatMYR } from "@/lib/money";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: Trend) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const fulfillment = trend !== "sales";

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

        <div className="flex overflow-hidden rounded-sm border border-hairline">
          {(
            [
              ["fulfillment", "Fulfillment"],
              ["sales", "Sales"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={fulfillment === (value === "fulfillment")}
              onClick={() => select(value)}
              className={`h-control-sm px-md text-[length:var(--text-caption)] transition-colors -outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary ${
                fulfillment === (value === "fulfillment")
                  ? "bg-surface-soft font-semibold text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {label}
            </button>
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
