"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { pickMeasure, type SalesMeasure, type SalesSeries } from "@/lib/analytics/sales";
import { SalesLineChart } from "@/components/dashboard/SalesLineChart";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";
import { usePendingChoice } from "@/hooks/usePendingChoice";

/**
 * One card, two measures of the same orders: what they were worth, or how many
 * units they carried. Both series are already here, so the switch is drawn
 * from the click — the URL write behind it only keeps the choice shareable.
 */
export function SalesCard({
  measure,
  sales,
  agg,
  aggLabel,
}: {
  measure: SalesMeasure;
  sales: SalesSeries;
  agg: string;
  aggLabel: string;
}) {
  const measures = usePendingChoice<SalesMeasure>(measure);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: SalesMeasure) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("measure", next);
    measures.choose(next, `${pathname}?${params.toString()}`);
  };

  const units = measures.value === "units";
  const picked = pickMeasure(sales, measures.value);
  const across = `across ${sales.points.length} ${aggLabel}`;

  return (
    <section className="rounded-xl bg-surface p-xl">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {units ? "Quantity over time" : "Sales over time"}
          </p>
          <h2 className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink">
            {units
              ? `${formatUnits(picked.total)} units ${across}`
              : `${formatMYR(picked.total.toFixed(2))} ${across}`}
          </h2>
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            Totals per period · hover a point for the value
          </p>
        </div>

        <div
          className="flex overflow-hidden rounded-sm border border-hairline"
          aria-busy={measures.pending || undefined}
        >
          {(
            [
              ["sales", "Sales"],
              ["units", "Quantity"],
            ] as const
          ).map(([value, label]) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={measures.value === value}
              pending={measures.isPending(value)}
              dimmed={measures.pending && !measures.isPending(value)}
              onClick={() => select(value)}
            >
              {label}
            </ChoiceButton>
          ))}
        </div>
      </div>

      <div className="mt-lg">
        <SalesLineChart series={sales} measure={measures.value} agg={agg} />
      </div>
    </section>
  );
}
