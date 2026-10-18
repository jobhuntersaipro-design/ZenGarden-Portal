"use client";

import { useState, type ReactNode } from "react";
import { pageRange } from "@/lib/queries/pagination";

/** A feed accumulates one row an action; ten is a screenful. */
export const FEED_PAGE_SIZE = 10;

const step =
  "inline-flex min-h-control-md items-center gap-xxs rounded-sm px-sm py-xxs text-[length:var(--text-body-sm)] text-ink transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-focus disabled:pointer-events-none disabled:text-ink-disabled sm:min-h-0";

/**
 * An activity feed paged in the browser, ten rows at a time (2026-10-18).
 *
 * Not through the URL: each feed is one card on a page that holds others, and
 * a `?page=` round trip would re-render all of it and scroll the reader back
 * to the top. The rows arrive already rendered — each child is one `<li>`.
 */
export function PagedList({
  children,
  as: List = "ul",
  className,
}: {
  children: ReactNode[];
  as?: "ul" | "ol";
  className?: string;
}) {
  const [page, setPage] = useState(1);
  const total = children.length;
  const { from, to, pages } = pageRange(page, FEED_PAGE_SIZE, total);
  // A feed that shortens under a reader must not strand them past its end.
  const current = Math.min(page, pages);
  const shown = children.slice((current - 1) * FEED_PAGE_SIZE, current * FEED_PAGE_SIZE);

  return (
    <>
      <List className={className}>{shown}</List>
      {total > FEED_PAGE_SIZE ? (
        <div className="mt-md flex flex-wrap items-center justify-between gap-md">
          <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-secondary">
            {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-sm">
            <button
              type="button"
              className={step}
              disabled={current <= 1}
              onClick={() => setPage(current - 1)}
            >
              Previous
            </button>
            <span className="text-[length:var(--text-body-sm)] text-ink-tertiary">
              Page {current} of {pages}
            </span>
            <button
              type="button"
              className={step}
              disabled={current >= pages}
              onClick={() => setPage(current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
