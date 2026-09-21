"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { usePendingChoice } from "@/hooks/usePendingChoice";

export type DemandWindowValue = string;

/**
 * How far ahead the board looks. One strip, so it takes the shared
 * optimistic-selection treatment every other chip row in the portal has —
 * the clicked option spins and its siblings dim while the server re-renders.
 */
export function DemandToolbar({
  value,
  options,
}: {
  value: DemandWindowValue;
  options: { value: string; label: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const windows = usePendingChoice<DemandWindowValue>(value);

  const hrefFor = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("window", next);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <SegmentGroup label="Window" busy={windows.pending}>
      {options.map((option) => (
        <ChoiceButton
          key={option.value}
          look="segment"
          selected={windows.value === option.value}
          pending={windows.isPending(option.value)}
          dimmed={windows.pending && !windows.isPending(option.value)}
          onClick={() => windows.choose(option.value, hrefFor(option.value))}
        >
          {option.label}
        </ChoiceButton>
      ))}
    </SegmentGroup>
  );
}
