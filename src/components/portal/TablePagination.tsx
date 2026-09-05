"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES, pageRange } from "@/lib/queries/pagination";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { from, to, pages } = pageRange(page, size, total);

  const go = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const step =
    "rounded-sm px-sm py-xxs text-[length:var(--text-body-sm)] text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none disabled:text-ink-disabled";

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
          className="h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          {sizes.map((option) => (
            <option key={option} value={option}>
              {option} per page
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-sm">
        <button
          type="button"
          className={step}
          disabled={page <= 1}
          onClick={() => go({ page: String(page - 1) })}
        >
          Prev
        </button>
        <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-secondary">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className={step}
          disabled={page >= pages}
          onClick={() => go({ page: String(page + 1) })}
        >
          Next
        </button>
      </div>
    </div>
  );
}
