"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/arc/pagination/pagination";
import inputStyles from "@/components/arc/input/input.module.css";
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

  // Arc's pagination, whose ring travels to the page chosen, and
  // the page-size select drawn as an Arc field.
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
          onChange={(event) => go({ size: event.target.value, page: null })}
          className={`${inputStyles.input} w-auto pr-xl`}
        >
          {sizes.map((option) => (
            <option key={option} value={option}>
              {option} per page
            </option>
          ))}
        </select>
      </div>
      <div aria-busy={steps.pending || undefined}>
        <Pagination
          page={page}
          pageCount={pages}
          onPageChange={stepTo}
          label="Pages"
        />
      </div>
    </div>
  );
}
