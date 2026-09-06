"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { DonutShare, type EntityBase } from "@/components/dashboard/DonutShare";
import { OTHER_VAR, SHARE_VARS, cssVar } from "@/lib/analytics/palette";
import type { MixMeasure } from "@/lib/analytics/product-mix";
import type { ShareSlice } from "@/lib/analytics/share";
import { formatMYR } from "@/lib/money";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { usePendingChoice } from "@/hooks/usePendingChoice";

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
  hrefBase,
}: {
  slices: ShareSlice[];
  measure: MixMeasure;
  hrefBase?: EntityBase;
}) {
  const [openOther, setOpenOther] = useState(false);
  const otherId = useId();
  const largest = Math.max(...slices.map((slice) => slice.value), 0);

  const amount = (value: number) =>
    measure === "value"
      ? formatMYR(value.toFixed(2))
      : `${Math.round(value).toLocaleString("en-MY")} units`;

  return (
    <ul className="flex flex-1 flex-col gap-sm">
      {slices.map((slice, index) => {
        const swatch = (
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-xxs"
            style={{ backgroundColor: colorFor(index, slice.isOther) }}
          />
        );
        const members = slice.members ?? [];

        return (
          <li key={slice.id} className="flex flex-col gap-xxs">
            <div className="flex items-center gap-xs">
              {slice.isOther ? (
                <button
                  type="button"
                  aria-expanded={openOther}
                  aria-controls={otherId}
                  onClick={() => setOpenOther((open) => !open)}
                  className="flex min-w-0 flex-1 items-center gap-xs rounded-xxs text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {swatch}
                  <span className="min-w-0 truncate text-[length:var(--text-body-sm)] text-ink-disabled">
                    {slice.label}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={`size-3.5 shrink-0 text-ink-tertiary transition-transform duration-[0.25s] ${openOther ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <>
                  {swatch}
                  {hrefBase ? (
                    <Link
                      href={`${hrefBase}/${slice.id}`}
                      title={slice.label}
                      className="min-w-0 flex-1 truncate rounded-xxs text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {slice.label}
                    </Link>
                  ) : (
                    <span
                      title={slice.label}
                      className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
                    >
                      {slice.label}
                    </span>
                  )}
                </>
              )}
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
                {amount(slice.value)}
              </span>
              <span className="w-14 shrink-0 text-right tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                {slice.share.toFixed(1)}%
              </span>
            </div>

            {/* What the fold is hiding, each row a link to the thing it counts. */}
            {slice.isOther && openOther && members.length > 0 ? (
              <ul
                id={otherId}
                className="ml-md mt-xxs flex flex-col gap-xxs border-l border-hairline pl-sm"
              >
                {members.map((member) => (
                  <li key={member.id} className="flex items-center gap-sm">
                    {hrefBase ? (
                      <Link
                        href={`${hrefBase}/${member.id}`}
                        title={member.label}
                        className="min-w-0 flex-1 truncate rounded-xxs text-[length:var(--text-body-sm)] text-ink underline-offset-2 hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {member.label}
                      </Link>
                    ) : (
                      <span
                        title={member.label}
                        className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
                      >
                        {member.label}
                      </span>
                    )}
                    <span className="w-36 shrink-0 text-right tabular-nums text-[length:var(--text-caption)] text-ink-secondary">
                      {amount(member.value)}
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                      {member.share.toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function WhatTheyBuy({
  slices,
  measure,
  heading = "What they buy",
  hrefBase,
  showMeasureToggle = true,
}: {
  slices: ShareSlice[];
  measure: MixMeasure;
  /** `/products` on a buyer page, `/buyers` on a product page. */
  hrefBase?: EntityBase;
  /** The product page reuses this card as "Who buys it". */
  heading?: string;
  showMeasureToggle?: boolean;
}) {
  // The slices are computed per measure on the server, so only the toggle
  // flips early; the figures wait for the data that matches them.
  const measures = usePendingChoice<MixMeasure>(measure);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (next: MixMeasure) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("measure", next);
    measures.choose(next, `${pathname}?${params.toString()}`);
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
          aria-busy={measures.pending || undefined}
        >
          {(
            [
              ["value", "Value (RM)"],
              ["qty", "Quantity"],
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
          <HBarList slices={slices} measure={measure} hrefBase={hrefBase} />
        </div>
      )}
    </section>
  );
}
