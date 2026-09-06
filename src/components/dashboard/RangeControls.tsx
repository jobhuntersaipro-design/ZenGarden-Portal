"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AGGREGATIONS, RANGE_PRESETS, type RangePreset } from "@/lib/analytics/range";
import type { Aggregation } from "@/lib/dates";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
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
}: {
  preset: RangePreset | null;
  from: string;
  to: string;
  agg: Aggregation;
  summary: string;
}) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(preset === null);

  const set = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="mb-lg flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <div className="flex flex-wrap items-center gap-xxs">
          {RANGE_PRESETS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={preset === option.value}
              // Clicking a chip rewrites both dates by clearing them.
              onClick={() =>
                set({ preset: option.value, from: null, to: null })
              }
              className={`h-control-sm rounded-pill px-md text-[length:var(--text-body-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                preset === option.value
                  ? "bg-ink text-canvas"
                  : "bg-surface-soft text-ink-secondary hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
          className="ml-auto text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
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
              className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {summary}
          {/* The summary claims a count and a total. While the server is
              recomputing them that claim is stale, so it says so here rather
              than letting the figures move under the reader (brief G1). */}
          <UpdatingHint />
        </p>

        <div className="flex items-center gap-xs">
          <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            Aggregate
          </span>
          <div className="flex overflow-hidden rounded-sm border border-hairline">
            {AGGREGATIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={agg === option.value}
                onClick={() => set({ agg: option.value })}
                className={`h-control-sm px-sm text-[length:var(--text-caption)] transition-colors focus-visible:outline-2 -outline-offset-2 focus-visible:outline-primary ${
                  agg === option.value
                    ? "bg-surface-soft font-semibold text-ink"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
