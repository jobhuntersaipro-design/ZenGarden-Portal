"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";
import type { DemandOption } from "@/lib/queries/demand";

const GRAINS: { value: DemandGrain; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

const SEARCH_DEBOUNCE_MS = 200;

/** The select's own styling, three times over rather than three near-copies. */
const SELECT =
  "h-control-md sm:h-control-sm max-w-56 rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus";

/**
 * What the board is showing, and of what.
 *
 * Switching grain drops the span rather than carrying it over — "Next 12" is
 * a year by month, a quarter by week and a fortnight by day, and silently
 * reinterpreting the number would change the question without saying so. The
 * new grain opens at its own default.
 *
 * One `usePendingChoice` per strip, so a grain click never spins the span.
 */
export function DemandToolbar({
  grain,
  window,
  spans,
  families,
  products,
}: {
  grain: DemandGrain;
  window: string;
  spans: { value: string; label: string }[];
  families: DemandOption[];
  products: DemandOption[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useUrlNavigation();
  const grains = usePendingChoice<DemandGrain>(grain);
  const windows = usePendingChoice<string>(window);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hrefFor = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };
  const write = (next: Record<string, string | null>) => replace(hrefFor(next));

  const href = (next: { by?: DemandGrain; window?: string }) =>
    hrefFor(
      next.by
        ? { by: next.by, window: String(DEMAND_SPAN[next.by]) }
        : { window: next.window ?? null },
    );

  return (
    <div className="flex flex-col gap-sm">
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

      <div className="flex flex-wrap items-center gap-sm">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
          />
          <Input
            aria-label="Search the board by product, SKU, family, market, buyer, PO number or Order ID"
            // Six things are searched; the three a planner reaches for are
            // what fits. The rest are in the label, for anyone who asks.
            placeholder="Product, buyer, PO number…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(
                () => write({ q: event.target.value }),
                SEARCH_DEBOUNCE_MS,
              );
            }}
            className="h-control-md sm:h-control-sm w-full pl-xl sm:w-80"
          />
        </div>

        {/* Offered only once there is more than one to choose between: a
            dropdown holding a single option is a label, not a filter. */}
        {families.length > 1 ? (
          <select
            aria-label="Family"
            value={searchParams.get("family") ?? ""}
            onChange={(event) => write({ family: event.target.value })}
            className={SELECT}
          >
            <option value="">All families</option>
            {families.map((family) => (
              <option key={family.value} value={family.value}>
                {family.label}
              </option>
            ))}
          </select>
        ) : null}

        {products.length > 1 ? (
          <select
            aria-label="Product"
            value={searchParams.get("product") ?? ""}
            onChange={(event) => write({ product: event.target.value })}
            className={SELECT}
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.value} value={product.value}>
                {product.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}
