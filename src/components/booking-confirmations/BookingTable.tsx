"use client";

import { useState } from "react";
import type { BookingStatus } from "@/generated/prisma/enums";
import { deleteBookingConfirmation } from "@/actions/booking-confirmations";
import { DataTable, type Column } from "@/components/portal/DataTable";
import { BOOKING_BADGE, StatusBadge } from "@/components/portal/StatusBadge";
import { TablePagination } from "@/components/portal/TablePagination";
import { RowDeleteButton } from "@/components/purchase-orders/RowDeleteButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PersonChip } from "@/components/ui/person";
import { useTableSort } from "@/hooks/useTableSort";
import { formatDate, formatDateTime } from "@/lib/dates";
import { toast } from "@/lib/toast";
import type { SortDirection } from "@/lib/queries/pagination";

/** What the server hands over: dates already crossed as ISO strings. */
export type BookingRow = {
  id: string;
  fileName: string;
  fileType: string;
  status: BookingStatus;
  bookingNumber: string | null;
  carrier: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  etdPol: string | null;
  etaPod: string | null;
  uploadedAt: string;
  uploadedByName: string;
  uploadedByImage: string | null;
  reviewedByName: string | null;
  reviewedByImage: string | null;
  reviewedAt: string | null;
};

const FILE_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
};

const blank = <span className="text-ink-tertiary">—</span>;

/** `etdPol` is a calendar day; formatDate reads it in KL, still that day. */
const day = (value: string | null) => (value ? formatDate(value) : blank);

/** A person and when, stacked, so two facts take one column's width. */
const who = (name: string, image: string | null, at: string) => (
  <span className="flex min-w-0 flex-col gap-xxs" title={formatDateTime(at)}>
    <PersonChip name={name} image={image} />
    <span className="text-[length:var(--text-caption)] text-ink-tertiary">{formatDate(at)}</span>
  </span>
);

/**
 * The columns a reader asked for — uploaded, uploaded by, reviewed by — stay
 * in a 1440 window's 1118px card. Ports share one stacked Route column and
 * the carrier rides under the booking number; seven separate columns measured
 * 1507px and pushed exactly those three past the edge.
 */
function columns(canDelete: (row: BookingRow) => boolean): Column<BookingRow>[] {
  return [
    {
      key: "bookingNumber",
      header: "Booking no.",
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-xxs">
          <span className="flex min-w-0 items-center gap-xs">
            <span className="shrink-0 rounded-xxs bg-surface-soft px-xxs font-mono text-[length:var(--text-caption)] text-ink-tertiary">
              {FILE_LABEL[row.fileType] ?? "FILE"}
            </span>
            {/* Until it is read, the file name is what tells two apart. */}
            {row.bookingNumber ? (
              <span className="truncate font-medium">{row.bookingNumber}</span>
            ) : (
              <span className="block max-w-40 truncate text-ink-secondary" title={row.fileName}>
                {row.fileName}
              </span>
            )}
          </span>
          {row.carrier ? (
            <span className="block max-w-48 truncate text-[length:var(--text-caption)] text-ink-tertiary" title={row.carrier}>
              {row.carrier}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      // Sorted by the port of loading, the first line.
      key: "portOfLoading",
      header: "Route",
      showAt: "md",
      cell: (row) =>
        row.portOfLoading || row.portOfDischarge ? (
          <span className="flex max-w-48 flex-col gap-xxs">
            <span className="truncate" title={row.portOfLoading ?? undefined}>
              {row.portOfLoading ?? "—"}
            </span>
            <span className="truncate text-ink-secondary" title={row.portOfDischarge ?? undefined}>
              → {row.portOfDischarge ?? "—"}
            </span>
          </span>
        ) : (
          blank
        ),
    },
    // Below a 48rem card (a 1024 window) it waits, so Uploaded, Reviewed by
    // and the delete button stay inside the card; the phone card shows it.
    { key: "etdPol", header: "ETD POL", defaultDir: "asc", showAt: "md", cell: (row) => day(row.etdPol) },
    { key: "etaPod", header: "ETA POD", defaultDir: "asc", showAt: "lg", cell: (row) => day(row.etaPod) },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={BOOKING_BADGE[row.status]} />,
    },
    {
      key: "uploadedAt",
      header: "Uploaded",
      defaultDir: "desc",
      cell: (row) => who(row.uploadedByName, row.uploadedByImage, row.uploadedAt),
    },
    {
      // Sorted by when, so a blank sorts last; the column says who.
      key: "reviewedAt",
      header: "Reviewed by",
      defaultDir: "desc",
      cell: (row) =>
        row.reviewedByName && row.reviewedAt ? (
          who(row.reviewedByName, row.reviewedByImage, row.reviewedAt)
        ) : (
          <span className="text-ink-disabled">Not reviewed</span>
        ),
    },
    {
      key: "actions",
      header: "",
      sortable: false,
      cell: (row) => (canDelete(row) ? <DeleteBooking row={row} /> : null),
    },
  ];
}

/** On a phone: the identifier and status, then the route and its dates. */
function bookingCard(row: BookingRow) {
  const route = [row.portOfLoading, row.portOfDischarge].filter(Boolean).join(" → ");
  const dates = [
    row.etdPol ? `ETD ${formatDate(row.etdPol)}` : null,
    row.etaPod ? `ETA ${formatDate(row.etaPod)}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-xxs">
      <div className="flex items-start justify-between gap-sm">
        <span className="min-w-0 truncate text-[length:var(--text-body-md)] font-medium text-ink">
          {row.bookingNumber ?? row.fileName}
        </span>
        <span className="shrink-0">
          <StatusBadge status={BOOKING_BADGE[row.status]} />
        </span>
      </div>
      {route ? (
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">{route}</span>
      ) : null}
      {dates.length ? (
        <span className="text-[length:var(--text-body-sm)] text-ink-secondary">{dates.join(" · ")}</span>
      ) : null}
      <span className="truncate text-[length:var(--text-caption)] text-ink-tertiary">
        Uploaded {formatDate(row.uploadedAt)} by {row.uploadedByName}
        {row.reviewedByName ? ` · reviewed by ${row.reviewedByName}` : ""}
      </span>
    </div>
  );
}

function DeleteBooking({ row }: { row: BookingRow }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const name = row.bookingNumber ? `booking ${row.bookingNumber}` : row.fileName;
  return (
    <>
      <RowDeleteButton label={`Delete ${name}`} onOpen={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this booking confirmation?</DialogTitle>
            <DialogDescription>
              Removes {name} and everything read from it. The file is deleted too, so
              it would have to be uploaded again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="bg-ink text-canvas hover:bg-ink-deep"
              pending={pending}
              onClick={async () => {
                setPending(true);
                try {
                  const result = await deleteBookingConfirmation(row.id);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setOpen(false);
                  toast.success("Booking confirmation deleted");
                } catch {
                  toast.error("We couldn't reach the server. Try again.");
                } finally {
                  setPending(false);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BookingTable({
  rows,
  sort,
  page,
  size,
  total,
  canUpload,
  canReview,
}: {
  rows: BookingRow[];
  sort: { key: string; dir: SortDirection };
  page: number;
  size: number;
  total: number;
  canUpload: boolean;
  canReview: boolean;
}) {
  const onSortChange = useTableSort();
  // The server checks again; this only decides whether to offer the button.
  const canDelete = (row: BookingRow) =>
    row.status === "REVIEWED" ? canReview : canUpload;
  return (
    <>
      <DataTable
        columns={columns(canDelete)}
        rows={rows}
        sort={sort}
        onSortChange={onSortChange}
        emptyText="No booking confirmations match."
        emptyDescription="Clear the search or a filter, or upload one."
        rowHref={(row) => `/booking-confirmations/${row.id}`}
        renderCard={bookingCard}
      />
      <TablePagination page={page} size={size} total={total} />
    </>
  );
}
