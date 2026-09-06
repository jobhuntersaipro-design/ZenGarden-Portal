"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { BuyerRangePreset } from "@/lib/analytics/buyer-range";
import { AGGREGATIONS } from "@/lib/analytics/range";
import type { Aggregation } from "@/lib/dates";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { usePendingChoice } from "@/hooks/usePendingChoice";

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
  const presets = usePendingChoice<BuyerRangePreset>(preset);
  const aggs = usePendingChoice<Aggregation | undefined>(agg);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="mb-lg flex flex-col gap-xs">
      <div
        className="flex flex-wrap items-center gap-xxs"
        aria-busy={presets.pending || undefined}
      >
        {options.map((option) => (
          <ChoiceButton
            key={option.value}
            look="pill"
            selected={presets.value === option.value}
            pending={presets.isPending(option.value)}
            dimmed={presets.pending && !presets.isPending(option.value)}
            onClick={() =>
              presets.choose(option.value, hrefFor("range", option.value))
            }
          >
            {option.label}
          </ChoiceButton>
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
          <SegmentGroup label="Aggregate" busy={aggs.pending}>
            {AGGREGATIONS.filter((option) =>
              aggregations.includes(option.value),
            ).map((option) => (
              <ChoiceButton
                key={option.value}
                look="segment"
                compact
                selected={aggs.value === option.value}
                pending={aggs.isPending(option.value)}
                dimmed={aggs.pending && !aggs.isPending(option.value)}
                onClick={() =>
                  aggs.choose(option.value, hrefFor("agg", option.value))
                }
              >
                {option.label}
              </ChoiceButton>
            ))}
          </SegmentGroup>
        ) : null}
      </div>
    </div>
  );
}
