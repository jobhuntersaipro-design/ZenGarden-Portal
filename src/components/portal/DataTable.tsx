"use client";

import { Fragment, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsUpdating } from "@/components/portal/NavProgress";
import { Spinner } from "@/components/portal/Spinner";
import { useEdgeFades } from "@/hooks/useEdgeFades";
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
  /**
   * Leave this column out of the mobile card. The card is a list, not a row,
   * so every column costs a line — the ones that only matter when you are
   * scanning many rows at once are better dropped than stacked.
   */
  mobileHidden?: boolean;
  cell: (row: Row) => ReactNode;
};

/**
 * The one table in the app. Sorting is server-side on the underlying column,
 * never the formatted string, and lives in the URL so a sorted view can be
 * shared and survives a reload.
 *
 * Two presentations of the same rows. From `md` up it is a table. Below that
 * it is a list of cards: seven columns in a 246px window meant the Purchase
 * orders list showed a PO number and half a buyer, and everything else was
 * behind a horizontal drag (2026-09-06 review, B1). Only one is displayed, so
 * only one reaches the accessibility tree.
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
  const updating = useIsUpdating();
  /**
   * The sort that was just clicked, held until the server's sort replaces it
   * (or until the update settles without changing it — a failed write must
   * not leave an arrow on a column the rows are not sorted by). The header
   * shows it at once, with the spinner, instead of sitting untouched for the
   * whole round trip.
   */
  const [clicked, setClicked] = useState<{
    key: string;
    dir: SortDirection;
  } | null>(null);
  // Adjusted during render, not in an effect, so the reset lands in the same
  // paint as the change that caused it.
  const [seenSort, setSeenSort] = useState(sort);
  if (seenSort.key !== sort.key || seenSort.dir !== sort.dir) {
    setSeenSort(sort);
    setClicked(null);
  }
  const [seenUpdating, setSeenUpdating] = useState(updating);
  if (seenUpdating !== updating) {
    setSeenUpdating(updating);
    if (!updating) setClicked(null);
  }
  const shownSort = clicked ?? sort;
  /**
   * Which edges have content hidden past them (brief G5). A table that clips
   * "PO total" off the right with no visible edge just looks like a table
   * missing a column, so the overflow gets an affordance: a fade at whichever
   * side has more to scroll to.
   */
  const { ref: scroller, clipped, measure } = useEdgeFades<HTMLDivElement>();

  const applySort = (key: string, dir: SortDirection) => {
    setClicked({ key, dir });
    onSortChange(key, dir);
  };

  const setSort = (column: Column<Row>) => {
    const nextDir: SortDirection =
      shownSort.key === column.key
        ? shownSort.dir === "asc"
          ? "desc"
          : "asc"
        : (column.defaultDir ?? "asc");
    applySort(column.key, nextDir);
  };

  /**
   * The whole row is clickable, and the first cell holds a real link so the
   * row is also reachable by keyboard. A click that already went through the
   * link is left alone rather than navigated twice.
   */
  const openRow = (event: MouseEvent<HTMLElement>, href: string) => {
    if ((event.target as HTMLElement).closest("a")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  };

  const [titleColumn, ...restColumns] = columns;
  const cardColumns = restColumns.filter((column) => !column.mobileHidden);
  const sortable = columns.filter((column) => column.sortable !== false);

  return (
    <div>
      {/* Cards, below `md`. */}
      <div className="md:hidden">
        {rows.length > 0 && sortable.length > 0 ? (
          // The table sorts from its headers; a card has none, so the sort
          // moves to a control of its own rather than being unavailable.
          <div className="mb-sm flex items-center gap-xs">
            <label
              htmlFor="card-sort"
              className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
            >
              Sort
            </label>
            <select
              id="card-sort"
              value={shownSort.key}
              onChange={(event) => {
                const column = sortable.find(
                  (c) => c.key === event.target.value,
                );
                if (column) applySort(column.key, column.defaultDir ?? "asc");
              }}
              className="h-control-md min-w-0 flex-1 rounded-sm border border-hairline-strong bg-canvas px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
            >
              {sortable.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.header}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                applySort(
                  shownSort.key,
                  shownSort.dir === "asc" ? "desc" : "asc",
                )
              }
              aria-label={
                shownSort.dir === "asc"
                  ? "Sorted ascending — switch to descending"
                  : "Sorted descending — switch to ascending"
              }
              className="flex size-control-md shrink-0 items-center justify-center rounded-sm border border-hairline-strong text-ink focus-visible:outline-2 focus-visible:outline-focus"
            >
              {updating && clicked ? (
                <Spinner />
              ) : (
                <span aria-hidden>{shownSort.dir === "asc" ? "↑" : "↓"}</span>
              )}
            </button>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-canvas px-md py-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
            {emptyText}
          </p>
        ) : (
          <ul
            aria-busy={updating || undefined}
            className={`flex flex-col gap-sm transition-opacity ${updating ? "opacity-60" : ""}`}
          >
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <li
                  key={row.id}
                  onClick={href ? (event) => openRow(event, href) : undefined}
                  className={`rounded-lg border border-hairline bg-canvas p-md ${
                    href ? "cursor-pointer" : ""
                  }`}
                >
                  <div className="text-[length:var(--text-body-md)] font-medium text-ink">
                    {href ? (
                      <Link
                        href={href}
                        className="block rounded-xxs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        {titleColumn.cell(row)}
                      </Link>
                    ) : (
                      titleColumn.cell(row)
                    )}
                  </div>
                  {cardColumns.length > 0 ? (
                    <dl className="mt-xs grid grid-cols-[auto_1fr] items-baseline gap-x-md gap-y-xxs">
                      {cardColumns.map((column) => (
                        <Fragment key={column.key}>
                          <dt className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                            {column.header}
                          </dt>
                          <dd className="min-w-0 text-right text-[length:var(--text-body-sm)] text-ink">
                            {column.cell(row)}
                          </dd>
                        </Fragment>
                      ))}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Table, from `md` up. */}
      <div className="relative hidden md:block">
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
          <table
            className="w-full border-separate border-spacing-0"
            aria-busy={updating || undefined}
          >
            <thead>
              <tr>
                {columns.map((column, index) => {
                  const active = shownSort.key === column.key;
                  const isSortable = column.sortable !== false;
                  const spinning = clicked?.key === column.key && updating;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active
                          ? shownSort.dir === "asc"
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
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => setSort(column)}
                          className="inline-flex items-center gap-xxs rounded-xxs hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                          {column.header}
                          {spinning ? (
                            <Spinner className="size-3" />
                          ) : active ? (
                            <span aria-hidden>
                              {shownSort.dir === "asc" ? "↑" : "↓"}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {/* The rows are the previous answer until the server sends the next
                one; they fade rather than vanish (brief G1, "stale with
                overlay"), so the reader keeps their place. */}
            <tbody
              className={`transition-opacity ${updating ? "opacity-60" : ""}`}
            >
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
                      onClick={
                        href ? (event) => openRow(event, href) : undefined
                      }
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
                            column.align === "right"
                              ? "text-right tabular-nums"
                              : "text-left"
                          } ${index === 0 ? "sticky left-0 z-10" : ""}`}
                        >
                          {href && index === 0 ? (
                            <Link
                              href={href}
                              className="block rounded-xxs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
    </div>
  );
}
