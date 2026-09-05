"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BuyerRangePreset } from "@/lib/analytics/buyer-range";

/** One range drives the whole page, and it lives in the URL so it can be shared. */
export function BuyerRangeChips({
  preset,
  summary,
  options,
}: {
  preset: BuyerRangePreset;
  summary: string;
  options: { value: BuyerRangePreset; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const select = (value: BuyerRangePreset) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
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
      <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
        {summary}
      </p>
    </div>
  );
}
