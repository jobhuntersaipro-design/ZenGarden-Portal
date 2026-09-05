"use client";

import type { MouseEvent, ReactNode } from "react";
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
    <div className="overflow-x-auto rounded-lg border border-hairline bg-canvas">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((column) => {
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
                  className={`px-md py-sm font-mono text-[length:var(--text-eyebrow)] font-normal whitespace-nowrap ${
                    column.align === "right" ? "text-right" : "text-left"
                  } ${active ? "text-ink" : "text-ink-tertiary"}`}
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
            rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={row.id}
                  onClick={href ? (event) => openRow(event, href) : undefined}
                  className={`border-b border-hairline last:border-0 transition-colors hover:bg-surface ${href ? "cursor-pointer" : ""}`}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.key}
                      // Cells do not wrap: "RM 60,960.10" broken over two lines
                      // is not a money value any more. Wide tables scroll in
                      // their own container instead (00-master.md §4).
                      className={`px-md py-sm text-[length:var(--text-body-sm)] whitespace-nowrap text-ink ${
                        column.align === "right" ? "text-right tabular-nums" : "text-left"
                      }`}
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
  );
}
