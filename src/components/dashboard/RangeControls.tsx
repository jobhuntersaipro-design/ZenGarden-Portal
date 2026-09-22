"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AGGREGATIONS,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/analytics/range";
import type { Aggregation } from "@/lib/dates";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * The preset chips are the primary control and sit alone on the first row. The
 * From/To inputs stay behind a toggle — they were competing with the chips for
 * a job most people do with one click — and open automatically when the URL
 * already carries a custom range.
 */
export function RangeControls({
  preset,
  from,
  to,
  agg,
  summary,
  filterCaption,
  children,
}: {
  preset: RangePreset | null;
  from: string;
  to: string;
  agg: Aggregation;
  summary: string;
  /**
   * What the page's product filters are narrowing to, or null. It sits with
   * the summary rather than beside the selects because it is a statement
   * about every figure below, not a label on a control (Phase 53 §2.1).
   */
  filterCaption?: string | null;
  /** The market, brand and category selects. */
  children?: ReactNode;
}) {
  const { replace } = useUrlNavigation();
  // Two groups, two transitions: a preset click must not spin the aggregate.
  const presets = usePendingChoice<RangePreset | null>(preset);
  const aggs = usePendingChoice<Aggregation>(agg);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(preset === null);

  const hrefFor = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  };
  const set = (next: Record<string, string | null>) => replace(hrefFor(next));

  return (
    <div className="mb-lg flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <div
          className="flex flex-wrap items-center gap-xxs"
          aria-busy={presets.pending || undefined}
        >
          {RANGE_PRESETS.map((option) => (
            <ChoiceButton
              key={option.value}
              look="pill"
              selected={presets.value === option.value}
              pending={presets.isPending(option.value)}
              dimmed={presets.pending && !presets.isPending(option.value)}
              // Clicking a chip rewrites both dates by clearing them.
              onClick={() =>
                presets.choose(
                  option.value,
                  hrefFor({ preset: option.value, from: null, to: null }),
                )
              }
            >
              {option.label}
            </ChoiceButton>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
          // `inline-flex` + a touch-height minimum: as a bare text button this
          // was a 21px tap target (2026-09-06 review, A7).
          className="ml-auto inline-flex min-h-control-md items-center rounded-xxs text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          {customOpen ? "Hide custom range" : "Custom range"}
        </button>

        {customOpen ? (
          <div className="flex items-center gap-xs">
            <label className="sr-only" htmlFor="range-from">
              From
            </label>
            <input
              id="range-from"
              type="date"
              value={from}
              max={to}
              // Editing a date deselects every chip, because the range is no
              // longer the preset's.
              onChange={(event) =>
                set({ from: event.target.value, to, preset: null })
              }
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
            />
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              to
            </span>
            <label className="sr-only" htmlFor="range-to">
              To
            </label>
            <input
              id="range-to"
              type="date"
              value={to}
              min={from}
              onChange={(event) =>
                set({ from, to: event.target.value, preset: null })
              }
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
            />
          </div>
        ) : null}

        {/* The product filters, on the same row as the dates they compose
            with. Each one changes every figure on the page, so neither is
            hidden behind the More analytics disclosure. */}
        {children}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {summary}
          {filterCaption ? (
            <span className="text-ink">{` · ${filterCaption}`}</span>
          ) : null}
          {/* The summary claims a count and a total. While the server is
              recomputing them that claim is stale, so it says so here rather
              than letting the figures move under the reader (brief G1). */}
          <UpdatingHint />
        </p>

        <SegmentGroup label="Aggregate" busy={aggs.pending}>
          {AGGREGATIONS.map((option) => (
            <ChoiceButton
              key={option.value}
              look="segment"
              compact
              selected={aggs.value === option.value}
              pending={aggs.isPending(option.value)}
              dimmed={aggs.pending && !aggs.isPending(option.value)}
              onClick={() =>
                aggs.choose(option.value, hrefFor({ agg: option.value }))
              }
            >
              {option.label}
            </ChoiceButton>
          ))}
        </SegmentGroup>
      </div>
    </div>
  );
}
