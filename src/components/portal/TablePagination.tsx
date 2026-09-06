"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "@/components/portal/Spinner";
import { PAGE_SIZES, pageRange } from "@/lib/queries/pagination";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/** The footer under every table (design reference §4). */
export function TablePagination({
  page,
  size,
  total,
  sizes = PAGE_SIZES,
}: {
  page: number;
  size: number;
  total: number;
  /** Must match what the page actually paginates by, or the footer lies. */
  sizes?: readonly number[];
}) {
  const { replace } = useUrlNavigation();
  // The step that was clicked spins; the page label keeps the server's page
  // until the rows that belong to the new one are actually on screen.
  const steps = usePendingChoice<number>(page);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { from, to, pages } = pageRange(page, size, total);

  const hrefFor = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `${pathname}?${params.toString()}`;
  };
  const go = (next: Record<string, string | null>) => replace(hrefFor(next));
  const stepTo = (target: number) =>
    steps.choose(target, hrefFor({ page: String(target) }));

  const step =
    "inline-flex min-h-control-md items-center gap-xxs rounded-sm px-sm py-xxs text-[length:var(--text-body-sm)] text-ink transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:text-ink-disabled sm:min-h-0";
  const dimmed = (target: number) =>
    steps.pending && !steps.isPending(target) ? "opacity-60" : "";

  return (
    <div className="mt-sm flex flex-wrap items-center justify-between gap-md">
      <div className="flex items-center gap-sm">
        <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-secondary">
          {from}–{to} of {total}
        </span>
        <label className="sr-only" htmlFor="page-size">
          Rows per page
        </label>
        <select
          id="page-size"
          value={size}
          // Changing the page size resets to page 1; page 7 of a longer list
          // is often past the end of a shorter one.
          onChange={(event) => go({ size: event.target.value, page: null })}
          className="h-control-md sm:h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
        >
          {sizes.map((option) => (
            <option key={option} value={option}>
              {option} per page
            </option>
          ))}
        </select>
      </div>

      <div
        className="flex items-center gap-sm"
        aria-busy={steps.pending || undefined}
      >
        <button
          type="button"
          className={`${step} ${dimmed(page - 1)}`}
          disabled={page <= 1}
          onClick={() => stepTo(page - 1)}
        >
          {steps.isPending(page - 1) ? <Spinner /> : null}
          Prev
        </button>
        <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-secondary">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className={`${step} ${dimmed(page + 1)}`}
          disabled={page >= pages}
          onClick={() => stepTo(page + 1)}
        >
          {steps.isPending(page + 1) ? <Spinner /> : null}
          Next
        </button>
      </div>
    </div>
  );
}
