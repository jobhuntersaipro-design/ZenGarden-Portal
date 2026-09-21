"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";

const GRAINS: { value: DemandGrain; label: string }[] = [
  { value: "week", label: "Weekly" },
  { value: "day", label: "Daily" },
];

/**
 * Two strips: the grain, and how far ahead at that grain.
 *
 * Switching grain drops the span rather than carrying it over — "Next 12" as
 * weeks is a quarter and as days is a fortnight, and silently reinterpreting
 * the number would change the question without saying so. The new grain opens
 * at its own default.
 *
 * One `usePendingChoice` per strip, so a grain click never spins the span.
 */
export function DemandToolbar({
  grain,
  window,
  spans,
}: {
  grain: DemandGrain;
  window: string;
  spans: { value: string; label: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const grains = usePendingChoice<DemandGrain>(grain);
  const windows = usePendingChoice<string>(window);

  const href = (next: { by?: DemandGrain; window?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.by) {
      params.set("by", next.by);
      params.set("window", String(DEMAND_SPAN[next.by]));
    }
    if (next.window) params.set("window", next.window);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-md">
      <SegmentGroup label="Grain" busy={grains.pending}>
        {GRAINS.map((option) => (
          <ChoiceButton
            key={option.value}
            look="segment"
            selected={grains.value === option.value}
            pending={grains.isPending(option.value)}
            dimmed={grains.pending && !grains.isPending(option.value)}
            onClick={() => grains.choose(option.value, href({ by: option.value }))}
          >
            {option.label}
          </ChoiceButton>
        ))}
      </SegmentGroup>

      <SegmentGroup label="Window" busy={windows.pending}>
        {spans.map((option) => (
          <ChoiceButton
            key={option.value}
            look="segment"
            selected={windows.value === option.value}
            pending={windows.isPending(option.value)}
            dimmed={windows.pending && !windows.isPending(option.value)}
            onClick={() => windows.choose(option.value, href({ window: option.value }))}
          >
            {option.label}
          </ChoiceButton>
        ))}
      </SegmentGroup>
    </div>
  );
}
