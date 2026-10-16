"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import { ChecklistDots } from "@/components/shipments/ChecklistDots";
import { formatDate } from "@/lib/dates";
import type { ShipmentListRow } from "@/lib/queries/shipments";

const blank = <span className="text-ink-tertiary">—</span>;
const noSort = () => {};

const COLUMNS: Column<ShipmentListRow>[] = [
  {
    key: "reference",
    header: "Shipment",
    sortable: false,
    cell: (row) => (
      <span className="flex min-w-0 flex-col gap-xxs">
        <span className="font-mono font-medium">{row.reference}</span>
        <span className="block max-w-56 truncate text-[length:var(--text-caption)] text-ink-tertiary" title={row.buyer.name}>
          {row.buyer.name}
          {row.market ? ` · ${row.market}` : ""}
        </span>
      </span>
    ),
  },
  {
    key: "orders",
    header: "Orders",
    sortable: false,
    align: "right",
    cell: (row) => (
      <span className="tabular-nums" title={row.orders.join("\n")}>
        {row.orders.length}
      </span>
    ),
  },
  {
    key: "etd",
    header: "ETD / ETA",
    sortable: false,
    showAt: "md",
    cell: (row) =>
      row.etd || row.eta ? (
        <span className="flex flex-col gap-xxs tabular-nums">
          <span>{row.etd ? formatDate(row.etd) : "—"}</span>
          <span className="text-ink-secondary">{row.eta ? formatDate(row.eta) : "—"}</span>
        </span>
      ) : (
        blank
      ),
  },
  {
    key: "documents",
    header: "Documents",
    sortable: false,
    cell: (row) => (
      <span className="flex flex-col gap-xxs">
        <ChecklistDots slots={row.checklist.slots} />
        <span className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
          {row.checklist.requiredDone} of {row.checklist.requiredTotal}
        </span>
      </span>
    ),
  },
  { key: "createdAt", header: "Created", sortable: false, cell: (row) => formatDate(row.createdAt) },
];

function card(row: ShipmentListRow) {
  return (
    <div className="flex flex-col gap-xxs">
      <span className="font-mono text-[length:var(--text-body-md)] font-medium text-ink">{row.reference}</span>
      <span className="truncate text-[length:var(--text-body-sm)] text-ink-secondary">
        {row.buyer.name} · {row.orders.length} {row.orders.length === 1 ? "order" : "orders"}
      </span>
      {row.etd || row.eta ? (
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
          ETD {row.etd ? formatDate(row.etd) : "—"} · ETA {row.eta ? formatDate(row.eta) : "—"}
        </span>
      ) : null}
      <span className="flex items-center gap-sm">
        <ChecklistDots slots={row.checklist.slots} withLabels />
      </span>
      <span className="text-[length:var(--text-caption)] text-ink-tertiary">
        {row.checklist.requiredDone} of {row.checklist.requiredTotal} required documents
      </span>
    </div>
  );
}

/** Newest first, one order only (Phase 63 §4.2); filters and sorts are Phase 64. */
export function ShipmentTable({
  rows,
  page,
  size,
  total,
}: {
  rows: ShipmentListRow[];
  page: number;
  size: number;
  total: number;
}) {
  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        sort={{ key: "createdAt", dir: "desc" }}
        onSortChange={noSort}
        emptyText="No shipments match."
        emptyDescription="Clear the search, or start one from a purchase order."
        rowHref={(row) => `/shipments/${row.id}`}
        renderCard={card}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
