"use client";

import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import { ChecklistDots, ShipmentStatusBadge } from "@/components/shipments/ChecklistDots";
import { BookingPreview } from "@/components/shipments/ShippingPreviews";
import { formatDate } from "@/lib/dates";
import type { ShipmentListRow } from "@/lib/queries/shipments";

const blank = <span className="text-ink-tertiary">—</span>;

const poLine = (row: ShipmentListRow) => (row.poNumbers.length ? row.poNumbers.join(", ") : "No PO yet");
const noSort = () => {};

/** "TIIU6249628 · 40FT", then "+2" for the rest, as the sheet's one column. */
function containerLine(row: ShipmentListRow): string | null {
  const [first, ...rest] = row.containers;
  if (!first) return null;
  const head = [first.containerNo, first.size].filter(Boolean).join(" · ") || "Container";
  return rest.length ? `${head} +${rest.length}` : head;
}

const COLUMNS: Column<ShipmentListRow>[] = [
  {
    key: "reference",
    header: "Shipment",
    sortable: false,
    // PO numbers lead (the reference a buyer quotes), then our shipment ID, then the buyer.
    cell: (row) => (
      <span className="flex min-w-0 max-w-64 flex-col gap-xxs">
        <span className="font-medium whitespace-normal">{poLine(row)}</span>
        <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">{row.reference}</span>
        <span className="block truncate text-[length:var(--text-caption)] text-ink-tertiary" title={row.buyer.name}>
          {row.buyer.name}
        </span>
      </span>
    ),
  },
  {
    key: "destination",
    header: "Destination",
    sortable: false,
    showAt: "md",
    // The port the booking names; the market until a booking does.
    cell: (row) => {
      const where = row.portOfDischarge ?? row.market;
      if (!where) return blank;
      return (
        <span className="flex max-w-48 items-center gap-xs" title={where}>
          {row.flag ? (
            // eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL; nothing to optimise
            <img src={row.flag.src} alt="" className="h-3 w-auto shrink-0 rounded-xxs" />
          ) : null}
          <span className="truncate">{where}</span>
        </span>
      );
    },
  },
  {
    key: "container",
    header: "Container / vessel",
    sortable: false,
    showAt: "lg",
    cell: (row) =>
      row.containers.length || row.vessel ? (
        <span className="flex min-w-0 flex-col gap-xxs">
          <span className="font-mono">{containerLine(row) ?? "—"}</span>
          <span className="block max-w-48 truncate text-ink-secondary" title={row.vessel ?? undefined}>
            {row.vessel ?? "—"}
          </span>
        </span>
      ) : (
        blank
      ),
  },
  {
    key: "status",
    header: "Documents",
    sortable: false,
    // One column, not two: the status, the bar a segment per step, and what is missing.
    cell: (row) => (
      <span className="flex w-56 flex-col items-start gap-xxs">
        <span className="flex items-center gap-xs">
          <ShipmentStatusBadge status={row.checklist.status} />
          <span className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
            {row.checklist.requiredDone} of {row.checklist.requiredTotal}
          </span>
        </span>
        <ChecklistDots slots={row.checklist.slots} />
        {row.checklist.reason ? (
          <span className="whitespace-normal text-[length:var(--text-caption)] text-ink-secondary">{row.checklist.reason}</span>
        ) : null}
      </span>
    ),
  },
  {
    key: "orders",
    header: "Orders",
    showAt: "wide",
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
];

function card(row: ShipmentListRow) {
  return (
    <div className="flex flex-col gap-xxs">
      <span className="flex items-start justify-between gap-sm">
        <span className="flex min-w-0 flex-col">
          <span className="text-[length:var(--text-body-md)] font-medium text-ink">{poLine(row)}</span>
          <span className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">{row.reference}</span>
        </span>
        <ShipmentStatusBadge status={row.checklist.status} />
      </span>
      {row.checklist.reason ? (
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">{row.checklist.reason}</span>
      ) : null}
      <span className="truncate text-[length:var(--text-body-sm)] text-ink-secondary">
        {row.buyer.name} · {row.orders.length} {row.orders.length === 1 ? "order" : "orders"}
      </span>
      {row.market || row.portOfDischarge || row.containers.length || row.vessel ? (
        <span className="truncate text-[length:var(--text-body-sm)] text-ink-secondary">
          {[row.portOfDischarge ?? row.market, containerLine(row), row.vessel].filter(Boolean).join(" · ")}
        </span>
      ) : null}
      {row.etd || row.eta ? (
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">
          ETD {row.etd ? formatDate(row.etd) : "—"} · ETA {row.eta ? formatDate(row.eta) : "—"}
        </span>
      ) : null}
      <ChecklistDots slots={row.checklist.slots} />
      <span className="text-[length:var(--text-caption)] tabular-nums text-ink-tertiary">
        {row.checklist.requiredDone} of {row.checklist.requiredTotal} documents
      </span>
    </div>
  );
}

/** Sorted and filtered by the toolbar above (Phase 64). */
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
        preview={(row) => <BookingPreview booking={row.booking} earlier={row.earlierBookings} />}
        previewOn="row"
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
