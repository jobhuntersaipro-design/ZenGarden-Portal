"use client";

import { SlopeChart } from "@/components/arc/slope-chart/slope-chart";

/**
 * Arc's slope chart for the market mix: each market's share of attributed
 * sales before and in this range. A client component of its own because the
 * chart takes formatters, and functions cannot cross from the server card.
 */
export function MarketSlope({
  rows,
}: {
  rows: { market: string; share: number; priorShare: number }[];
}) {
  return (
    <SlopeChart
      className="mt-md"
      label="Share of attributed sales by market"
      startLabel="Before"
      endLabel="This range"
      ranks
      data={rows.map((row) => ({
        key: row.market,
        label: row.market,
        start: row.priorShare,
        end: row.share,
      }))}
      formatValue={(value) => `${value.toFixed(1)}%`}
      formatChange={(change) => `${change >= 0 ? "+" : ""}${change.toFixed(1)}pp`}
    />
  );
}
