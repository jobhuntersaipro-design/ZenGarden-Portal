"use client";

import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import type { ShareSlice } from "@/lib/analytics/share";
import { OTHER_VAR, SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import { formatMYR } from "@/lib/money";

const colorFor = (index: number, isOther: boolean) =>
  cssVar(isOther ? OTHER_VAR : SHARE_VARS[index % SHARE_VARS.length]);

/**
 * The route an entity in this donut belongs to. A string rather than a
 * function because the dashboard renders this from a server component, and a
 * formatter cannot cross that boundary.
 *
 * A base ending in `=` takes its id as a query value rather than a path
 * segment: a market is not a row with an id of its own, it is a filter over
 * the products that carry it.
 */
export type EntityBase = "/buyers" | "/products" | "/products?market=";

/**
 * Arc's donut, 168px — arcs that morph between ranges, hover and focus that
 * preview a slice in the centre, and its own synced legend. Colours are
 * assigned by rank in a fixed order and never cycled. "Other" is handed over
 * unfolded, so Arc does its own grouping past six slices.
 */
export function DonutShare({
  eyebrow,
  slices,
  centreLabel,
  bare = false,
}: {
  eyebrow: string;
  slices: ShareSlice[];
  centreLabel: string;
  /** Ring only: the buyer page nests it inside a card that has its own frame. */
  bare?: boolean;
}) {
  if (slices.length === 0) {
    return (
      <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {eyebrow}
        </p>
        <p className="mt-md text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing sold in this range.
        </p>
      </section>
    );
  }

  const data = slices.flatMap((slice, index) =>
    slice.isOther
      ? (slice.members ?? []).map((member) => ({
          key: member.id,
          label: member.label,
          value: member.value,
        }))
      : [{ key: slice.id, label: slice.label, value: slice.value, color: colorFor(index, false) }],
  );
  const chart = (
    <DonutChart
      label={eyebrow || "Share"}
      data={data}
      totalLabel={centreLabel}
      formatValue={(value) => formatMYR(value.toFixed(2))}
      maxSegments={6}
      legend={!bare}
      size={168}
    />
  );
  if (bare) return chart;
  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-canvas p-lg">
      <p className="mb-md font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        {eyebrow}
      </p>
      {chart}
    </section>
  );
}
