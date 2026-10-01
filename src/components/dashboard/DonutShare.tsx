"use client";

import { DonutChart } from "@/components/arc/donut-chart/donut-chart";
import type { ShareSlice } from "@/lib/analytics/share";
import { OTHER_VAR, SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import { formatMYR, formatMYRCompact } from "@/lib/money";

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
  unit = "money",
}: {
  eyebrow: string;
  slices: ShareSlice[];
  /** Names what the centre shows at rest: Arc's centre is the ring's total, not its top slice. */
  centreLabel: string;
  /** Ring only: the buyer page nests it inside a card that has its own frame. */
  bare?: boolean;
  /** What the slices count. A ring of units printed as ringgit read "RM 1,234.00" for 1,234 cartons. */
  unit?: "money" | "units";
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
      formatValue={(value) =>
        unit === "money"
          ? formatMYR(value.toFixed(2))
          : `${Math.round(value).toLocaleString("en-MY")} units`
      }
      // The centre of a 168px ring is ~90px: the exact figure (RM 642,043.26)
      // printed as "RM 6…". The legend and bars beside it carry the exact one.
      formatCenter={(value) =>
        unit === "money"
          ? formatMYRCompact(value)
          : new Intl.NumberFormat("en-MY", { notation: "compact", maximumFractionDigits: 1 }).format(value)
      }
      maxSegments={6}
      legend={!bare}
      size={168}
      // Arc's figure is a size container, so it has no width of its own: in a
      // shrink-wrapped parent (the buyer page's flex row) it collapsed to 0
      // and the ring spilled over the bars beside it. A bare ring says its
      // own width.
      className={bare ? "w-donut" : undefined}
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
