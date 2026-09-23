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
  /** Our internal tracking ID (`W-2609-00014`); null on an uploaded scan. */
  orderId: string | null;
  /** The buyer's own PO number; null when they gave none. */
  poNumber: string | null;
  /** An upload's file name, for deleting it. */
  fileName: string | null;
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
  hideBuyer = false,
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
  /** On a buyer's own page the buyer is the page; leave it off the cards. */
  hideBuyer?: boolean;
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
        renderCard={(row) => poCard(row, hideBuyer)}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}

/**
 * A record on a phone: **PO number, Order ID, Buyer**, with the status beside
 * the title — the fields the user chose on 2026-09-22, all three of them
 * identifiers rather than figures, because a phone is where somebody looks an
 * order up rather than compares values.
 *
 * **A field with no value prints no line at all.** The default card renders
 * every column as a label/value row, so a queued scan came out seven rows and
 * 550px with `—`, `—`, `0` and `RM 0.00` among them: 1.4 records to a screen.
 * In a table a dash holds a column open and is worth printing; in a vertical
 * card it is a row that says nothing.
 *
 * So the leading line is whichever identifier the row actually has — the PO
 * number, or the file name where a scan has not been read yet — and the Order
 * ID line exists only on an order placed on the shop. Total, PO date, items
 * and source are on the row's own page, one tap away, and in the desktop
 * table.
 */
export function poCard(row: PoRow, hideBuyer = false) {
  // The buyer is unknown on an upload nobody has reviewed; the query fills the
  // field with a placeholder rather than leaving it null, so ask the id.
  // Hidden on a buyer's own page, where the name is the page and would print
  // 65 times down one list. The same call the demand board's breakdown makes
  // for market: a fact that is constant down every row is not worth a row.
  const buyer = hideBuyer || !row.buyerId ? null : row.buyerName;

  return (
    <div className="flex flex-col gap-xxs">
      <div className="flex items-start justify-between gap-sm">
        <span className="flex min-w-0 items-center gap-xs text-[length:var(--text-body-md)] font-medium text-ink">
          <span className="shrink-0 rounded-xxs bg-surface-soft px-xxs font-mono text-[length:var(--text-caption)] text-ink-tertiary">
            {FILE_LABEL[row.fileType] ?? "FILE"}
          </span>
          <span className="truncate" title={row.poNumber ?? row.fileName ?? undefined}>
            {row.poNumber ?? row.fileName ?? "Not read yet"}
          </span>
          {row.revision > 1 ? (
            <span className="shrink-0 rounded-full bg-surface-soft px-xs text-[length:var(--text-caption)] text-ink-secondary">
              Rev {row.revision}
            </span>
          ) : null}
        </span>
        {/* Status rides the title line rather than taking a row: it is why
            somebody opens this list on a phone, and a card in the review queue
            must not read the same as a confirmed order. */}
        <span className="shrink-0">
          {row.kind === "PO" && row.stage ? (
            <StageBadge stage={row.stage as PoStage} />
          ) : (
            <StatusBadge status={row.status as IntakeStatus} />
          )}
        </span>
      </div>

      {/* Only an order placed on the shop has one, so this line is absent on
          every scan — which is most of them. */}
      {row.orderId ? (
        <span className="truncate text-[length:var(--text-body-sm)] text-ink-secondary">
          Order ID {row.orderId}
        </span>
      ) : null}

      {/* No buyer, no line. An upload has none until somebody reviews it, and
          the first draft of this card printed "Waiting to be reviewed" there —
          which read as a lie on the two drafts that are not waiting on anyone:
          one still being extracted, one whose extraction failed. The badge on
          the title line already says which of the three a draft is. */}
      {buyer ? (
        <span className="truncate text-[length:var(--text-body-sm)] text-ink-secondary" title={buyer}>
          {buyer}
        </span>
      ) : null}
    </div>
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
    // Two columns, never one (2026-09-17). Order ID is our tracking ID and
    // only a shop order has one; PO number is the buyer's own and is blank
    // when they gave none. Neither is ever filled from the other.
    {
      key: "orderId",
      header: "Order ID",
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-xs">
          <span className="shrink-0 rounded-xxs bg-surface-soft px-xxs font-mono text-[length:var(--text-caption)] text-ink-tertiary">
            {FILE_LABEL[row.fileType] ?? "FILE"}
          </span>
          {row.orderId ? (
            <span className="truncate font-medium" title={`Order ID ${row.orderId}`}>
              {row.orderId}
            </span>
          ) : row.kind === "DRAFT" && row.fileName ? (
            // An upload not yet confirmed has no Order ID, and often no PO
            // number read yet either (a failed extraction). Its file name,
            // beside the file badge, is what tells two of them apart — shown
            // as the file it is, never in the PO number column. Capped, or
            // the filename becomes the column width and pushes Status off
            // the card (measured: an uncapped name added ~370px).
            <span
              className="block min-w-0 max-w-56 truncate text-ink-secondary"
              title={`Uploaded file ${row.fileName} — no Order ID`}
            >
              {row.fileName}
            </span>
          ) : (
            <span className="text-ink-tertiary" title="No Order ID — uploaded, not placed on the shop">
              —
            </span>
          )}
          {row.revision > 1 ? (
            <span className="shrink-0 rounded-full bg-surface-soft px-xs text-[length:var(--text-caption)] text-ink-secondary">
              Rev {row.revision}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "poNumber",
      header: "PO number",
      cell: (row) =>
        row.poNumber ? (
          <span className="block max-w-56 truncate" title={`PO number ${row.poNumber}`}>
            {row.poNumber}
          </span>
        ) : (
          <span className="text-ink-tertiary" title="The buyer gave no PO number">
            —
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
      // The card at 1024 (sidebar up) is ~700px. Date, items and source
      // come back once that card clears `md`; below it they would push
      // Status past the edge.
      showAt: "md",
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
      // The widest header. It fits once the card clears 64rem — a ~1344px
      // window with the sidebar, and every wider one — and not in the ~960px
      // card a 1280px window leaves. Blank on a failed scan either way.
      showAt: "lg",
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
      showAt: "md",
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
      showAt: "md",
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
      // are still on the detail page. The desktop table shows them only once
      // the card is `xl` — wider than `--container-page` (1160px), so on this
      // layout they stay on the detail page rather than forcing a scrollbar
      // on every screen. Twelve columns measured 1342px; the page holds 1160.
      mobileHidden: true,
      showAt: "xl",
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
      // Same trade as Uploaded by: the backlog is still sortable from the
      // phone's Sort control, and the name is on the order. The column
      // itself does not fit beside the identifier at any width this page
      // actually reaches.
      mobileHidden: true,
      showAt: "xl",
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
            <DeleteUploadButton
              extractionId={row.id}
              fileName={row.fileName ?? "this upload"}
            />
          );
        }
        if (!canDeleteOrders) return null;
        if (row.kind === "WEB") {
          return (
            <DeleteWebOrderDialog
              webOrderId={row.id}
              reference={row.orderId ?? ""}
              lineCount={row.itemCount}
            />
          );
        }
        return (
          <DeletePoDialog
            variant="row"
            poId={row.id}
            orderId={row.orderId}
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
