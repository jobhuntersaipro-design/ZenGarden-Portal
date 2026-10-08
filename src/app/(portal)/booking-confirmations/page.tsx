import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/portal/PageHeader";
import { UpdatingHint } from "@/components/portal/UpdatingHint";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { Button } from "@/components/ui/button";
import { BookingFilters } from "@/components/booking-confirmations/BookingFilters";
import { BookingTable, type BookingRow } from "@/components/booking-confirmations/BookingTable";
import { can, requirePagePermission } from "@/lib/permissions/require";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import {
  BOOKING_CHIPS,
  BOOKING_SORT_KEYS,
  listBookingUploaders,
  listBookings,
  type BookingChip,
} from "@/lib/queries/booking-confirmations";
import { withLoadingFloor } from "@/lib/loading-floor";

export const metadata: Metadata = {
  title: "Booking Confirmations · Zen Garden Portal",
};
export const dynamic = "force-dynamic";

/** A calendar day crosses as `YYYY-MM-DD`; a timestamp as full ISO. */
const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

async function BookingConfirmationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePagePermission("bc.view");
  const params = await searchParams;

  const status = firstParam(params, "status") as BookingChip;
  const filters = {
    q: firstParam(params, "q")?.trim() || undefined,
    uploadedById: firstParam(params, "by") || undefined,
    status: BOOKING_CHIPS.includes(status) ? status : ("all" as const),
  };
  const sort = parseSort(params, BOOKING_SORT_KEYS, { key: "uploadedAt", dir: "desc" });
  const { page, size, skip, take } = parsePagination(params);

  const [{ rows, total }, uploaders, canUpload, canReview] = await Promise.all([
    listBookings(filters, sort, take, skip),
    listBookingUploaders(),
    can("bc.upload"),
    can("bc.review"),
  ]);

  const clientRows: BookingRow[] = rows.map((row) => ({
    id: row.id,
    fileName: row.originalName,
    fileType: row.mimeType,
    status: row.status,
    bookingNumber: row.bookingNumber,
    carrier: row.carrier,
    portOfLoading: row.portOfLoading,
    portOfDischarge: row.portOfDischarge,
    etdPol: isoDay(row.etdPol),
    etaPod: isoDay(row.etaPod),
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedByName: row.uploadedBy.name,
    uploadedByImage: row.uploadedBy.image,
    reviewedByName: row.reviewedBy?.name ?? null,
    reviewedByImage: row.reviewedBy?.image ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Shipping"
        title="Booking confirmations"
        action={
          canUpload ? (
            <Button asChild>
              <Link href="/booking-confirmations/upload">
                <LinkSpinner />
                Upload BC
              </Link>
            </Button>
          ) : null
        }
      />

      <BookingFilters uploaders={uploaders} />

      <p className="mb-sm text-[length:var(--text-body-sm)] text-ink-secondary">
        <span className="tabular-nums">{total}</span>{" "}
        {total === 1 ? "booking confirmation" : "booking confirmations"}
        <UpdatingHint />
      </p>

      <BookingTable
        rows={clientRows}
        sort={sort}
        page={page}
        size={size}
        total={total}
        canUpload={canUpload}
        canReview={canReview}
      />
    </>
  );
}

export default withLoadingFloor(BookingConfirmationsPage);
