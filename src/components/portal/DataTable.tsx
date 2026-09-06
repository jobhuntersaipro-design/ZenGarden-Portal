"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SortDirection } from "@/lib/queries/pagination";

export type ColumnAlign = "left" | "right";

export type Column<Row> = {
  key: string;
  header: string;
  align?: ColumnAlign;
  /** Every column sorts unless it says otherwise (design reference §4). */
  sortable?: boolean;
  /**
   * Which way the first click goes. Descending for numbers, dates and money;
   * ascending for text and badges — so the useful end comes first either way.
   */
  defaultDir?: SortDirection;
  cell: (row: Row) => ReactNode;
};

/**
 * The one table in the app. Sorting is server-side on the underlying column,
 * never the formatted string, and lives in the URL so a sorted view can be
 * shared and survives a reload.
 */
export function DataTable<Row extends { id: string }>({
  columns,
  rows,
  sort,
  onSortChange,
  emptyText,
  rowHref,
}: {
  columns: Column<Row>[];
  rows: Row[];
  sort: { key: string; dir: SortDirection };
  /** Where the sort goes. `useTableSort` writes it to the URL. */
  onSortChange: (key: string, dir: SortDirection) => void;
  emptyText: string;
  rowHref?: (row: Row) => string;
}) {
  const router = useRouter();
  /**
   * Which edges have content hidden past them (brief G5). A table that clips
   * "PO total" off the right with no visible edge just looks like a table
   * missing a column, so the overflow gets an affordance: a fade at whichever
   * side has more to scroll to.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    const left = node.scrollLeft > 1;
    const right = node.scrollWidth - node.clientWidth - node.scrollLeft > 1;
    // Same object back when nothing moved, so a scroll inside the current
    // state does not re-render the table on every frame.
    setClipped((previous) =>
      previous.left === left && previous.right === right
        ? previous
        : { left, right },
    );
  }, []);

  /**
   * A ResizeObserver rather than a measurement taken once on mount: at mount
   * the table has not been laid out, so `scrollWidth` reads as the container
   * width and the fade never appears until the reader scrolls — which is
   * precisely the reader who did not know there was anything to scroll to.
   * The observer fires immediately on observe and again whenever the viewport
   * or the table's own content changes width.
   */
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const table = node.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [measure]);

  const setSort = (column: Column<Row>) => {
    const nextDir: SortDirection =
      sort.key === column.key
        ? sort.dir === "asc"
          ? "desc"
          : "asc"
        : (column.defaultDir ?? "asc");
    onSortChange(column.key, nextDir);
  };

  /**
   * The whole row is clickable, and the first cell holds a real link so the
   * row is also reachable by keyboard. A click that already went through the
   * link is left alone rather than navigated twice.
   */
  const openRow = (event: MouseEvent<HTMLTableRowElement>, href: string) => {
    if ((event.target as HTMLElement).closest("a")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  };

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={measure}
        className="overflow-x-auto rounded-lg border border-hairline bg-canvas"
      >
        {/* `border-separate` rather than `border-collapse`: a collapsed table
            merges its borders onto the row, and a sticky cell painted over
            them loses its own rules. With separate borders each cell carries
            its own, so the first column can be sticky and still look like part
            of the table. */}
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((column, index) => {
                const active = sort.key === column.key;
                const sortable = column.sortable !== false;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={`border-b border-hairline bg-canvas px-md py-sm font-mono text-[length:var(--text-eyebrow)] font-normal whitespace-nowrap ${
                      column.align === "right" ? "text-right" : "text-left"
                    } ${active ? "text-ink" : "text-ink-tertiary"} ${
                      // The first column stays put while the rest scrolls, so a
                      // row never loses the thing that identifies it (brief G5).
                      index === 0 ? "sticky left-0 z-20" : ""
                    }`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => setSort(column)}
                        className="inline-flex items-center gap-xxs rounded-xxs hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {column.header}
                        {active ? <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span> : null}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-md py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => {
                const href = rowHref?.(row);
                const last = rowIndex === rows.length - 1;
                return (
                  <tr
                    key={row.id}
                    onClick={href ? (event) => openRow(event, href) : undefined}
                    className={`group ${href ? "cursor-pointer" : ""}`}
                  >
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        // Cells do not wrap: "RM 60,960.10" broken over two lines
                        // is not a money value any more. Wide tables scroll in
                        // their own container instead (00-master.md §4).
                        //
                        // The hover tint is on the cell, not the row: the sticky
                        // first cell is opaque, so a background painted on the
                        // row would never show through it.
                        className={`bg-canvas px-md py-sm text-[length:var(--text-body-sm)] whitespace-nowrap text-ink transition-colors group-hover:bg-surface ${
                          last ? "" : "border-b border-hairline"
                        } ${
                          column.align === "right" ? "text-right tabular-nums" : "text-left"
                        } ${index === 0 ? "sticky left-0 z-10" : ""}`}
                      >
                        {href && index === 0 ? (
                          <Link
                            href={href}
                            className="block rounded-xxs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            {column.cell(row)}
                          </Link>
                        ) : (
                          column.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Fades, not scrollbars: a scrollbar on a trackpad is invisible until
          you already know to scroll. Each one only appears while there is
          something on that side to reach. */}
      {clipped.left ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-px left-px w-xl rounded-l-lg bg-linear-to-r from-canvas to-transparent"
        />
      ) : null}
      {clipped.right ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-px right-px w-xl rounded-r-lg bg-linear-to-l from-canvas to-transparent"
        />
      ) : null}
    </div>
  );
}
