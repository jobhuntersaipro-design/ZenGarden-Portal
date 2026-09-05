import type { ReactNode } from "react";
import Link from "next/link";
import type { DashboardData } from "@/lib/queries/dashboard";
import { formatMYR } from "@/lib/money";

/** Six small tiles. Concentration flips its tone above 60% (design ref §3.2). */
export function InRangeGrid({ data }: { data: DashboardData }) {
  const { inRange, pipeline } = data;
  const concentrated = inRange.topThreeShare > 60;

  const tiles: { label: string; value: string; caption: ReactNode }[] = [
    {
      label: "Largest PO",
      value: inRange.largest ? formatMYR(inRange.largest.total.toFixed(2)) : "—",
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
    },
    {
      label: "New buyers",
      value: String(inRange.newBuyers),
      caption: `${inRange.returningBuyers} returning`,
    },
    {
      label: "Top-3 concentration",
      value: `${inRange.topThreeShare.toFixed(0)}%`,
      caption: (
        <span className={concentrated ? "text-brand-amber" : "text-accent-green"}>
          {concentrated
            ? "Concentrated — revenue depends on 3 buyers"
            : "Healthy spread across buyers"}
        </span>
      ),
    },
    {
      label: "Items per PO",
      value: inRange.itemsPerOrder.toFixed(1),
      caption: `${inRange.totalUnits.toLocaleString("en-MY")} units in total`,
    },
    {
      label: "Extraction failures",
      value: `${inRange.failureRate.toFixed(1)}%`,
      caption: `${inRange.failedCount} of ${inRange.uploadCount} uploads needed a retry`,
    },
    {
      label: "Open pipeline",
      value: String(pipeline.openCount),
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
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-md border border-hairline bg-canvas p-md"
          >
            <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              {tile.label}
            </p>
            <p className="mt-xxs font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink tabular-nums">
              {tile.value}
            </p>
            <p className="mt-xxs truncate text-[length:var(--text-caption)] text-ink-secondary">
              {tile.caption}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
