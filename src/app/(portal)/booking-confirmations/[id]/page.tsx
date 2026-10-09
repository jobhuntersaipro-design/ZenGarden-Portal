import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/portal/BackLink";
import { PageHeader } from "@/components/portal/PageHeader";
import { BOOKING_BADGE, StatusBadge } from "@/components/portal/StatusBadge";
import { BookingForm, type BookingValues } from "@/components/booking-confirmations/BookingForm";
import { DownloadOriginal } from "@/components/purchase-orders/DownloadOriginal";
import { DocumentPreview } from "@/components/review/DocumentPreviewLoader";
import { can, requirePagePermission } from "@/lib/permissions/require";
import { formatDateTime } from "@/lib/dates";
import { BookingOrderLink } from "@/components/booking-confirmations/BookingOrderLink";
import { bookingOrderOptions, loadBooking } from "@/lib/queries/booking-confirmations";
import { orderIdentity, orderLabel } from "@/lib/order-identity";
import { BOOKING_FIELDS } from "@/lib/validation/booking-confirmations";
import { withLoadingFloor } from "@/lib/loading-floor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const booking = (await can("bc.view")) ? await loadBooking((await params).id) : null;
  return {
    title: `${booking?.bookingNumber ? `Booking ${booking.bookingNumber}` : "Booking confirmation"} · Zen Garden Portal`,
  };
}

async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("bc.view");
  const { id } = await params;
  const booking = await loadBooking(id);
  if (!booking || booking.status === "UPLOADING") notFound();

  const [canReview, canRetry] = await Promise.all([can("bc.review"), can("bc.upload")]);
  const orderOptions = canReview ? await bookingOrderOptions() : [];
  const endpoint = `/api/booking-confirmations/${booking.id}/url`;
  // Strings for the form; a date column crosses as its calendar day.
  const initial = Object.fromEntries(
    BOOKING_FIELDS.map(({ key }) => {
      const value = booking[key];
      return [key, value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? "")];
    }),
  ) as BookingValues;

  return (
    <>
      <BackLink fallbackHref="/booking-confirmations" />
      <PageHeader
        eyebrow={`Uploaded ${formatDateTime(booking.uploadedAt)} by ${booking.uploadedBy.name}`}
        title={booking.bookingNumber ? `Booking ${booking.bookingNumber}` : booking.originalName}
        action={
          <div className="flex items-center gap-sm">
            <StatusBadge status={BOOKING_BADGE[booking.status]} />
            <DownloadOriginal documentId={booking.id} endpoint={endpoint} />
          </div>
        }
      />
      {/* Keyed on status: the form holds its own copy of the fields, so a read
          that lands (Try again, or one still running at first paint) must
          start a fresh copy rather than keep the blank one. */}
      <BookingForm
        key={booking.status}
        id={booking.id}
        document={
          <DocumentPreview
            documentId={booking.id}
            originalName={booking.originalName}
            urlEndpoint={endpoint}
            download={<DownloadOriginal documentId={booking.id} endpoint={endpoint} />}
          />
        }
        status={booking.status}
        error={booking.error}
        initial={initial}
        canReview={canReview}
        canRetry={canRetry}
        linkedOrder={
          <BookingOrderLink
            bookingId={booking.id}
            linked={
              booking.purchaseOrder
                ? { id: booking.purchaseOrder.id, label: orderLabel(orderIdentity(booking.purchaseOrder)) }
                : null
            }
            options={orderOptions}
            canEdit={canReview}
          />
        }
        reviewedBy={
          booking.reviewedBy && booking.reviewedAt
            ? { ...booking.reviewedBy, at: booking.reviewedAt.toISOString() }
            : null
        }
      />
    </>
  );
}

export default withLoadingFloor(BookingPage);
