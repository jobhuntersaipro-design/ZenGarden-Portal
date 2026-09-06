"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { TablePagination } from "@/components/portal/TablePagination";
import {
  StageBadge,
  StatusBadge,
  type IntakeStatus,
} from "@/components/portal/StatusBadge";
import { useTableSort } from "@/hooks/useTableSort";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import type { PoStage } from "@/generated/prisma/enums";
import type { SortDirection } from "@/lib/queries/pagination";

/** What the server hands over: money and dates already crossed as strings. */
export type PoRow = {
  id: string;
  kind: "PO" | "DRAFT";
  poNumber: string;
  buyerName: string;
  buyerId: string | null;
  poDate: string | null;
  itemCount: number;
  total: string;
  status: string;
  stage: string | null;
  uploadedByName: string | null;
  uploadedByImage: string | null;
  confirmedByName: string | null;
  confirmedByImage: string | null;
  fileType: string;
  revision: number;
};

const FILE_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Person({
  name,
  image,
}: {
  name: string | null;
  image: string | null;
}) {
  if (!name) {
    // Visible from the list and sortable to the top: the backlog is the point.
    return <span className="text-ink-disabled">Not confirmed</span>;
  }
  return (
    <span className="flex items-center gap-xs">
      <Avatar className="size-6 shrink-0">
        {image ? <AvatarImage src={image} alt="" /> : null}
        <AvatarFallback className="bg-surface-soft text-[length:var(--text-caption)] text-ink">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {/* Ellipsised values always carry the full one (G4). */}
      <span className="truncate" title={name}>
        {name}
      </span>
    </span>
  );
}

export function PoTable({
  rows,
  sort,
  page,
  size,
  total,
}: {
  rows: PoRow[];
  sort: { key: string; dir: SortDirection };
  page: number;
  size: number;
  total: number;
}) {
  const onSortChange = useTableSort();

  const columns: Column<PoRow>[] = [
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
      key: "uploadedBy",
      header: "Uploaded by",
      // Two avatars per card is noise when you are scanning for a PO; both
      // are still on the detail page and in the desktop table.
      mobileHidden: true,
      cell: (row) => (
        <Person name={row.uploadedByName} image={row.uploadedByImage} />
      ),
    },
    {
      key: "confirmedBy",
      header: "Confirmed by",
      // Two avatars per card is noise when you are scanning for a PO; both
      // are still on the detail page and in the desktop table.
      mobileHidden: true,
      cell: (row) => (
        <Person name={row.confirmedByName} image={row.confirmedByImage} />
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No purchase orders match."
        rowHref={(row) =>
          row.kind === "PO" ? `/purchase-orders/${row.id}` : `/review/${row.id}`
        }
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
