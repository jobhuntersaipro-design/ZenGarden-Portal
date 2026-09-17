"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import {
  StageBadge,
  StatusBadge,
  type IntakeStatus,
} from "@/components/portal/StatusBadge";
import { DeletePoDialog } from "@/components/purchase-orders/DeletePoDialog";
import { DeleteUploadButton } from "@/components/purchase-orders/DeleteUploadButton";
import { DeleteWebOrderDialog } from "@/components/purchase-orders/DeleteWebOrderDialog";
import { PersonChip } from "@/components/ui/person";
import { useTableSort } from "@/hooks/useTableSort";
import { TIME_ZONE, formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import type { PoStage } from "@/generated/prisma/enums";
import type { SortDirection } from "@/lib/queries/pagination";

/** What the server hands over: money and dates already crossed as strings. */
export type PoRow = {
  id: string;
  kind: "PO" | "DRAFT" | "WEB";
  poNumber: string;
  buyerName: string;
  buyerId: string | null;
  poDate: string | null;
  deliveryDate: string | null;
  itemCount: number;
  total: string;
  status: string;
  stage: string | null;
  uploadedByName: string | null;
  uploadedByImage: string | null;
  confirmedByName: string | null;
  confirmedByImage: string | null;
  fileType: string;
  /** Where the order came from, from the query rather than inferred. */
  source: "web" | "scan";
  revision: number;
  /** When the row joined its list, as an ISO string (Phase 46). */
  queuedAt: string | null;
};

const FILE_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  // A shop order still waiting to be confirmed has no file of its own on this
  // row, and saying so is better than the "FILE" fallback, which reads like a
  // missing document.
  web: "WEB",
};


export function PoTable({
  rows,
  sort,
  page,
  size,
  total,
  canDeleteOrders = false,
}: {
  rows: PoRow[];
  sort: { key: string; dir: SortDirection };
  page: number;
  size: number;
  total: number;
  /**
   * Super admin only: confirmed purchase orders and shop orders. Only
   * /purchase-orders passes it; the dashboard and buyer tables stay read-only.
   */
  canDeleteOrders?: boolean;
}) {
  const onSortChange = useTableSort();

  return (
    <>
      <DataTable
        columns={poColumns({ canDeleteOrders })}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No purchase orders match."
        rowHref={poRowHref}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}

/** Where a row opens: the order, the shop order's review, or the upload's. */
export const poRowHref = (row: PoRow) =>
  row.kind === "PO"
    ? `/purchase-orders/${row.id}`
    : row.kind === "WEB"
      ? `/web-orders/${row.id}`
      : `/review/${row.id}`;

/**
 * The purchase-order columns, shared by the main table and the review queue
 * above it (Phase 46) so a row reads the same in both.
 */
export function poColumns({
  canDeleteOrders,
}: {
  canDeleteOrders: boolean;
}): Column<PoRow>[] {
  return [
    {
      key: "poNumber",
      header: "PO number",
      cell: (row) => (
        <span className="flex items-center gap-xs">
          <span className="shrink-0 rounded-xxs bg-surface-soft px-xxs font-mono text-[length:var(--text-caption)] text-ink-tertiary">
            {FILE_LABEL[row.fileType] ?? "FILE"}
          </span>
          <span className="truncate font-medium" title={row.poNumber}>
            {row.poNumber}
          </span>
          {row.revision > 1 ? (
            <span className="shrink-0 rounded-full bg-surface-soft px-xs text-[length:var(--text-caption)] text-ink-secondary">
              Rev {row.revision}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "buyerName",
      header: "Buyer",
      cell: (row) =>
        // A draft has no buyer yet, so there is nothing to link to.
        row.buyerId ? (
          <Link
            href={`/buyers/${row.buyerId}`}
            title={row.buyerName}
            className="block max-w-56 truncate hover:text-brand-link hover:underline"
          >
            {row.buyerName}
          </Link>
        ) : (
          <span className="block max-w-56 truncate" title={row.buyerName}>
            {row.buyerName}
          </span>
        ),
    },
    {
      key: "poDate",
      header: "PO date",
      defaultDir: "desc",
      cell: (row) =>
        row.poDate ? (
          formatDate(row.poDate)
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    {
      key: "deliveryDate",
      header: "Expected delivery",
      // Soonest first: the order about to leave is the one to look at.
      defaultDir: "asc",
      cell: (row) =>
        row.deliveryDate ? (
          formatDate(row.deliveryDate)
        ) : (
          <span className="text-ink-tertiary">—</span>
        ),
    },
    {
      key: "itemCount",
      header: "Items",
      align: "right",
      defaultDir: "desc",
      cell: (row) => row.itemCount,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      defaultDir: "desc",
      cell: (row) => formatMYR(row.total),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        // Intake status until the PO is confirmed, then its stage.
        row.kind === "PO" && row.stage ? (
          <StageBadge stage={row.stage as PoStage} />
        ) : (
          <StatusBadge status={row.status as IntakeStatus} />
        ),
    },
    {
      key: "source",
      header: "Source",
      // Deliberately not mobileHidden. Card mode drops the two avatar columns
      // as noise, but where an order came from is the one thing this column
      // exists to say.
      cell: (row) => (
        <span className="inline-flex shrink-0 items-center gap-xxs rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)]">
          {/* Neutral tones only: provenance is a permanent fact, not a
              process in flight, and 00-master.md §4 reserves the "something
              is happening" colour for the latter. The text carries the
              meaning here. */}
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${
              row.source === "web" ? "bg-ink-secondary" : "bg-ink-tertiary"
            }`}
          />
          {row.source === "web" ? "Shop" : "Manual"}
        </span>
      ),
    },
    {
      key: "uploadedBy",
      header: "Uploaded by",
      // Two avatars per card is noise when you are scanning for a PO; both
      // are still on the detail page and in the desktop table.
      mobileHidden: true,
      cell: (row) =>
        // Asked of `source`, not inferred from a missing uploader. Since
        // Phase 37 a confirmed shop order *has* an uploader — the buyer's own
        // contact, who is who the generated file was filed against — and
        // printing their name here would say a customer uploaded a scan. The
        // Source column says where the order came from, so this cell reads
        // the same as a genuinely missing uploader rather than repeating it.
        row.source === "web" ? (
          <span className="text-ink-disabled">—</span>
        ) : row.uploadedByName ? (
          <PersonChip name={row.uploadedByName} image={row.uploadedByImage} />
        ) : (
          <span className="text-ink-disabled">—</span>
        ),
    },
    {
      key: "confirmedBy",
      header: "Confirmed by",
      // Two avatars per card is noise when you are scanning for a PO; both
      // are still on the detail page and in the desktop table.
      mobileHidden: true,
      // Visible from the list and sortable to the top: the backlog is the point.
      cell: (row) =>
        row.confirmedByName ? (
          <PersonChip name={row.confirmedByName} image={row.confirmedByImage} />
        ) : (
          <span className="text-ink-disabled">Not confirmed</span>
        ),
    },
    {
      key: "actions",
      header: "",
      // Nothing to sort, and nothing to say in a card either: the card's own
      // title already links to the row.
      sortable: false,
      cell: (row) => {
        // Anyone may clear an upload that never became an order. A purchase
        // order is a sales record and a shop order is a buyer's, so both need
        // a super admin and the reference typed back.
        if (row.kind === "DRAFT") {
          return (
            <DeleteUploadButton extractionId={row.id} fileName={row.poNumber} />
          );
        }
        if (!canDeleteOrders) return null;
        if (row.kind === "WEB") {
          return (
            <DeleteWebOrderDialog
              webOrderId={row.id}
              reference={row.poNumber}
              lineCount={row.itemCount}
            />
          );
        }
        return (
          <DeletePoDialog
            variant="row"
            poId={row.id}
            poNumber={row.poNumber}
            lineItemCount={row.itemCount}
            monthLabel={
              row.poDate
                ? new Date(row.poDate).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                    timeZone: TIME_ZONE,
                  })
                : "this order's month"
            }
            // Revisions number from their predecessor plus one
            // (writePurchaseOrder), and the list shows the latest alone.
            supersedesRevision={row.revision > 1 ? row.revision - 1 : null}
            fromShop={row.source === "web"}
          />
        );
      },
    },
  ];
}
