"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import { useTableSort } from "@/hooks/useTableSort";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * The buyer's own orders, as a table (Phase 35).
 *
 * It reuses the portal's `DataTable` rather than growing a second one. That is
 * not laziness about styling: the table already carries the card mode below
 * `md`, the sticky first column, the scroll-edge fades and the pending row
 * treatment, all of which were measured and fixed on the mobile pass, and a
 * shop-only copy would start that work again from nothing.
 *
 * What the server hands over is already crossed into strings, because a Server
 * Component may not pass a `Date` or a `Decimal` to a client component.
 */
export type BuyerOrderRow = {
  id: string;
  reference: string;
  buyerReference: string | null;
  /** Already formatted, or null where the order has no date yet. */
  date: string | null;
  /** The day we said we would deliver. Null until the team confirms it. */
  deliveryDate: string | null;
  /** What the buyer should read, never the raw enum. */
  status: string;
  /** True for "Not accepted", the one status that is not progress. */
  declined: boolean;
  lineCount: number;
  total: string;
};

export function BuyerOrdersTable({
  rows,
  sort,
  page,
  size,
  total,
}: {
  rows: BuyerOrderRow[];
  sort: { key: string; dir: SortDirection };
  page: number;
  size: number;
  total: number;
}) {
  const onSortChange = useTableSort();

  const columns: Column<BuyerOrderRow>[] = [
    {
      key: "reference",
      header: "Order",
      cell: (row) => (
        <span className="truncate font-medium" title={row.reference}>
          {row.reference}
        </span>
      ),
    },
    {
      key: "buyerReference",
      header: "Your PO no.",
      cell: (row) =>
        row.buyerReference ? (
          <span className="truncate font-mono" title={row.buyerReference}>
            {row.buyerReference}
          </span>
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    {
      key: "date",
      header: "Date",
      defaultDir: "desc",
      cell: (row) =>
        row.date ?? <span className="text-ink-tertiary">—</span>,
    },
    {
      key: "deliveryDate",
      header: "Expected delivery",
      defaultDir: "desc",
      cell: (row) =>
        row.deliveryDate ?? <span className="text-ink-disabled">—</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <span
          className={
            row.declined ? "text-accent-red" : "text-ink-secondary"
          }
        >
          {row.status}
        </span>
      ),
    },
    {
      key: "lineCount",
      header: "Lines",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.lineCount,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.total),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No orders match."
        rowHref={(row) => shopHref.order(row.id)}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
