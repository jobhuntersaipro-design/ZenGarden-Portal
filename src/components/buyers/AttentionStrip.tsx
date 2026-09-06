"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { BuyerFilter } from "@/lib/queries/buyers";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

type Column = {
  value: Exclude<BuyerFilter, null>;
  label: string;
  definition: string;
  tone: string;
  count: number;
};

/**
 * The three counts and the table filter are one control, not two that happen
 * to agree. Clicking a column both filters the table and marks itself
 * selected, so the number above and the rows below are visibly the same thing.
 */
export function AttentionStrip({
  active,
  counts,
}: {
  active: BuyerFilter;
  counts: { lapsed: number; atRisk: number; overdue: number };
}) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const columns: Column[] = [
    {
      value: "lapsed",
      label: "Lapsed",
      definition: "bought last period, nothing since",
      tone: "text-accent-red",
      count: counts.lapsed,
    },
    {
      value: "at-risk",
      label: "At risk",
      definition: "silent past twice their usual gap",
      tone: "text-brand-amber",
      count: counts.atRisk,
    },
    {
      value: "overdue",
      label: "Overdue reorders",
      definition: "buyers with items past their usual interval",
      tone: "text-accent-red",
      count: counts.overdue,
    },
  ];

  const toggle = (value: Exclude<BuyerFilter, null>) => {
    const params = new URLSearchParams(searchParams.toString());
    // Clicking the selected column clears both the filter and the selection.
    if (active === value) params.delete("filter");
    else params.set("filter", value);
    params.delete("page");
    replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  return (
    <section className="mb-lg rounded-lg border border-hairline bg-canvas">
      <div className="px-lg pt-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Needs attention
        </p>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          Click a number to filter the table below
        </p>
      </div>

      <div className="mt-md grid divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {columns.map((column) => {
          const empty = column.count === 0;
          const selected = active === column.value;
          return (
            <button
              key={column.value}
              type="button"
              // An empty category is not a filter worth offering, so it is not
              // clickable and not in the tab order.
              disabled={empty}
              // Says why it does nothing, the way the Products tile does — a
              // greyed number with no explanation reads as a broken control.
              title={empty ? "Nothing to fix here" : undefined}
              aria-pressed={selected}
              onClick={() => toggle(column.value)}
              className={`p-lg text-left transition-colors focus-visible:outline-2 -outline-offset-2 focus-visible:outline-primary ${
                selected ? "bg-surface-soft ring-1 ring-inset ring-hairline-strong" : ""
              } ${empty ? "cursor-default" : "hover:bg-surface"}`}
            >
              <span
                className={`block font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] tabular-nums ${
                  empty ? "text-ink-disabled" : column.tone
                }`}
              >
                {column.count}
              </span>
              <span className="block text-[length:var(--text-body-sm)] text-ink">
                {column.label}
              </span>
              <span className="block text-[length:var(--text-caption)] text-ink-tertiary">
                {column.definition}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
