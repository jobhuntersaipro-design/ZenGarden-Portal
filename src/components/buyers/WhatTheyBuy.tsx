"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DonutShare } from "@/components/dashboard/DonutShare";
import { OTHER_VAR, SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import type { MixMeasure } from "@/lib/analytics/product-mix";
import type { ShareSlice } from "@/lib/analytics/share";
import { formatMYR } from "@/lib/money";

const colorFor = (index: number, isOther: boolean) =>
  cssVar(isOther ? OTHER_VAR : SHARE_VARS[index % SHARE_VARS.length]);

/**
 * The donut gives share of the whole; the bars rank the products against each
 * other. Bars are widths of the **largest row**, not of the total, so the
 * smaller ones stay readable instead of collapsing into slivers.
 */
function HBarList({
  slices,
  measure,
}: {
  slices: ShareSlice[];
  measure: MixMeasure;
}) {
  const largest = Math.max(...slices.map((slice) => slice.value), 0);

  return (
    <ul className="flex flex-1 flex-col gap-sm">
      {slices.map((slice, index) => (
        <li key={slice.id} className="flex flex-col gap-xxs">
          <div className="flex items-center gap-xs">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-xxs"
              style={{ backgroundColor: colorFor(index, slice.isOther) }}
            />
            <span
              title={slice.label}
              className={`min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] ${slice.isOther ? "text-ink-disabled" : "text-ink"}`}
            >
              {slice.label}
            </span>
          </div>
          <div className="flex items-center gap-sm">
            <span className="h-3.5 flex-1 overflow-hidden rounded-xxs bg-surface-soft">
              <span
                className="block h-full rounded-xxs"
                style={{
                  width: largest > 0 ? `${(slice.value / largest) * 100}%` : "0%",
                  backgroundColor: colorFor(index, slice.isOther),
                }}
              />
            </span>
            <span className="w-36 shrink-0 text-right tabular-nums text-[length:var(--text-body-sm)] text-ink">
              {measure === "value"
                ? formatMYR(slice.value.toFixed(2))
                : `${Math.round(slice.value).toLocaleString("en-MY")} units`}
            </span>
            <span className="w-14 shrink-0 text-right tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
              {slice.share.toFixed(1)}%
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function WhatTheyBuy({
  slices,
  measure,
  heading = "What they buy",
  showMeasureToggle = true,
}: {
  slices: ShareSlice[];
  measure: MixMeasure;
  /** The product page reuses this card as "Who buys it". */
  heading?: string;
  showMeasureToggle?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: MixMeasure) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("measure", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-md flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {heading}
          </p>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {measure === "value"
              ? "Share of spend in this range"
              : "Share of units bought in this range"}
          </p>
        </div>
        <div
          className={`flex overflow-hidden rounded-sm border border-hairline ${showMeasureToggle ? "" : "hidden"}`}
        >
          {(
            [
              ["value", "Value (RM)"],
              ["qty", "Quantity"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={measure === value}
              onClick={() => select(value)}
              className={`h-control-sm px-md text-[length:var(--text-caption)] transition-colors -outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary ${
                measure === value
                  ? "bg-surface-soft font-semibold text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {slices.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          Nothing bought in this range.
        </p>
      ) : (
        <div className="flex flex-wrap items-start gap-lg">
          <div className="shrink-0">
            <DonutShare
              eyebrow=""
              slices={slices}
              centreLabel={`top product by ${measure === "value" ? "value" : "units"}`}
              bare
            />
          </div>
          <HBarList slices={slices} measure={measure} />
        </div>
      )}
    </section>
  );
}
