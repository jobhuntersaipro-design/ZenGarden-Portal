import type { ReactNode } from "react";
import Link from "next/link";
import type { DashboardData } from "@/lib/queries/dashboard";
import { formatMYR } from "@/lib/money";
import { CountUp } from "@/components/portal/CountUp";

/** Six small tiles. Concentration flips its tone above 60% (design ref §3.2). */
export function InRangeGrid({ data }: { data: DashboardData }) {
  const { inRange, pipeline } = data;
  const concentrated = inRange.topThreeShare > 60;

  // `value` is a node, not a string, so the numeric ones can count up while
  // an absent figure stays a plain em dash.
  const tiles: {
    label: string;
    value: ReactNode;
    caption: ReactNode;
    /** Full width on a phone: a MYR figure does not fit half of one. */
    mobileFull?: boolean;
  }[] = [
    {
      label: "Largest PO",
      value: inRange.largest ? (
        <CountUp value={inRange.largest.total} format="money" />
      ) : (
        "—"
      ),
      caption: inRange.largest ? (
        <Link
          href={`/purchase-orders/${inRange.largest.id}`}
          className="text-brand-link underline-offset-2 hover:underline"
        >
          {inRange.largest.poNumber} · {inRange.largest.buyerName}
        </Link>
      ) : (
        "No orders in this range"
      ),
      mobileFull: true,
    },
    {
      label: "New buyers",
      value: <CountUp value={inRange.newBuyers} />,
      caption: `${inRange.returningBuyers} returning`,
    },
    {
      label: "Top-3 concentration",
      value: <CountUp value={inRange.topThreeShare} format="percent" />,
      caption: (
        <span
          className={concentrated ? "text-brand-amber" : "text-accent-green"}
        >
          {concentrated
            ? "Concentrated — revenue depends on 3 buyers"
            : "Healthy spread across buyers"}
        </span>
      ),
    },
    {
      label: "Items per PO",
      value: <CountUp value={inRange.itemsPerOrder} decimals={1} />,
      caption: `${inRange.totalUnits.toLocaleString("en-MY")} units in total`,
    },
    {
      label: "Extraction failures",
      value: (
        <CountUp value={inRange.failureRate} format="percent" decimals={1} />
      ),
      caption: `${inRange.failedCount} of ${inRange.uploadCount} uploads needed a retry`,
    },
    {
      label: "Open pipeline",
      value: <CountUp value={pipeline.openCount} />,
      caption: `${formatMYR(pipeline.openValue.toFixed(2))} still to deliver${
        pipeline.averageDaysToDeliver === null
          ? ""
          : ` · ${pipeline.averageDaysToDeliver.toFixed(0)} days avg order → delivered`
      }`,
    },
  ];

  return (
    <section>
      <p className="mb-sm font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        In this range
      </p>
      <div className="grid grid-cols-2 gap-md lg:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-md border border-hairline bg-canvas p-md ${
              tile.mobileFull ? "col-span-2 sm:col-span-1" : ""
            }`}
          >
            <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              {tile.label}
            </p>
            <p className="mt-xxs font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink tabular-nums">
              {tile.value}
            </p>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-secondary sm:truncate">
              {tile.caption}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
