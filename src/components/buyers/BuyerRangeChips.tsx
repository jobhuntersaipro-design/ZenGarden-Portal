"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { BuyerRangePreset } from "@/lib/analytics/buyer-range";
import { AGGREGATIONS } from "@/lib/analytics/range";
import type { Aggregation } from "@/lib/dates";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/** One range drives the whole page, and it lives in the URL so it can be shared. */
export function BuyerRangeChips({
  preset,
  summary,
  options,
  aggregations,
  agg,
}: {
  preset: BuyerRangePreset;
  summary: string;
  options: { value: BuyerRangePreset; label: string }[];
  /** Only buyer detail offers an aggregation; the roster has no chart. */
  aggregations?: Aggregation[];
  agg?: Aggregation;
}) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (value: BuyerRangePreset) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    params.delete("page");
    replace(`${pathname}?${params.toString()}`);
  };

  const setAgg = (value: Aggregation) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("agg", value);
    params.delete("page");
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="mb-lg flex flex-col gap-xs">
      <div className="flex flex-wrap items-center gap-xxs">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={preset === option.value}
            onClick={() => select(option.value)}
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
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {summary}
          {/* The summary claims a count and a total. While the server is
              recomputing them that claim is stale, so it says so here rather
              than letting the figures move under the reader (brief G1). */}
          <UpdatingHint />
        </p>

        {aggregations && agg ? (
          <div className="flex items-center gap-xs">
            <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Aggregate
            </span>
            <div className="flex overflow-hidden rounded-sm border border-hairline">
              {AGGREGATIONS.filter((option) =>
                aggregations.includes(option.value),
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={agg === option.value}
                  onClick={() => setAgg(option.value)}
                  className={`h-control-sm px-sm text-[length:var(--text-caption)] transition-colors -outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary ${
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
        ) : null}
      </div>
    </div>
  );
}
