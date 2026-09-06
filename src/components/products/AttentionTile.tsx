"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ProductFilter } from "@/lib/queries/products";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * The breakdown is a to-do list, so each count is a click target that sets the
 * matching quick-filter chip below. The tile and the chips are the same
 * control, not two that happen to agree.
 */
export function AttentionTile({
  counts,
}: {
  counts: { missingImage: number; inactive: number; notSold: number };
}) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parts: { filter: Exclude<ProductFilter, null>; count: number; label: string }[] =
    [
      { filter: "missing-image", count: counts.missingImage, label: "missing image" },
      { filter: "inactive", count: counts.inactive, label: "inactive" },
      { filter: "not-sold-60d", count: counts.notSold, label: "not sold 60d" },
    ];

  const total = counts.missingImage + counts.inactive + counts.notSold;

  const apply = (filter: Exclude<ProductFilter, null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("filter", filter);
    params.delete("page");
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="rounded-md border border-hairline bg-canvas p-md">
      <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Needs attention
      </p>
      <p
        className={`mt-xxs font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] tabular-nums ${
          total > 0 ? "text-brand-amber" : "text-ink"
        }`}
      >
        {total}
      </p>
      <p className="mt-xxs flex flex-wrap gap-xxs text-[length:var(--text-caption)] text-ink-secondary">
        {parts.map((part, index) => {
          const empty = part.count === 0;
          return (
            <span key={part.filter} className="flex items-center gap-xxs">
              {index > 0 ? <span aria-hidden className="text-ink-tertiary">·</span> : null}
              {empty ? (
                // Not clickable and not focusable: an empty category is not a
                // to-do, and offering it as one wastes a click.
                <span className="text-ink-disabled" title="Nothing to fix here">
                  {part.count} {part.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => apply(part.filter)}
                  className="rounded-xxs text-ink-secondary underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {part.count} {part.label}
                </button>
              )}
            </span>
          );
        })}
      </p>
    </div>
  );
}
