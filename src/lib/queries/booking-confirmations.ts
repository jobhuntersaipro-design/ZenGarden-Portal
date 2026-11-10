import type { Prisma } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  EXTRACTION_TIMEOUT_ERROR,
  EXTRACTION_TIMEOUT_MS,
} from "@/lib/extraction/expire";
import type { SortDirection } from "@/lib/queries/pagination";
import { SHIPMENT_PREVIEW_SELECT } from "@/lib/queries/shipments";

/** The list's status chips. Must stay in step with the chips on the page. */
export const BOOKING_CHIPS = ["all", "needs-review", "reviewed", "extracting", "failed"] as const;
export type BookingChip = (typeof BOOKING_CHIPS)[number];

const CHIP_STATUS: Record<Exclude<BookingChip, "all">, BookingStatus> = {
  "needs-review": BookingStatus.NEEDS_REVIEW,
  reviewed: BookingStatus.REVIEWED,
  extracting: BookingStatus.EXTRACTING,
  failed: BookingStatus.FAILED,
};

export const BOOKING_SORT_KEYS = [
  "bookingNumber",
  "portOfLoading",
  "etdPol",
  "etaPod",
  "status",
  "uploadedAt",
  "reviewedAt",
] as const;
export type BookingSortKey = (typeof BOOKING_SORT_KEYS)[number];

export type BookingFilters = {
  q?: string;
  status: BookingChip;
  uploadedById?: string;
};

/** Every text field a person might search a booking by. */
const SEARCHED = [
  "bookingNumber",
  "carrier",
  "containers",
  "portOfLoading",
  "transhipmentPort",
  "portOfDischarge",
  "finalDestination",
  "feederVessel",
  "motherVessel",
  "vesselTracking",
  "originalName",
] as const;

/**
 * An upload still on its way to R2 is never listed: it has no file to open.
 * A chip narrows to one status; "all" is every status but that one.
 */
export function bookingWhere(filters: BookingFilters): Prisma.BookingConfirmationWhereInput {
  return {
    status:
      filters.status === "all"
        ? { not: BookingStatus.UPLOADING }
        : CHIP_STATUS[filters.status],
    ...(filters.uploadedById ? { uploadedById: filters.uploadedById } : {}),
    ...(filters.q
      ? {
          OR: SEARCHED.map((field) => ({
            [field]: { contains: filters.q, mode: "insensitive" as const },
          })),
        }
      : {}),
  };
}

/** A blank sorts last in both directions (00-master.md §4); newest breaks ties. */
export function bookingOrderBy(sort: {
  key: BookingSortKey;
  dir: SortDirection;
}): Prisma.BookingConfirmationOrderByWithRelationInput[] {
  const first: Prisma.BookingConfirmationOrderByWithRelationInput =
    sort.key === "status" || sort.key === "uploadedAt"
      ? { [sort.key]: sort.dir }
      : { [sort.key]: { sort: sort.dir, nulls: "last" } };
  return [first, { uploadedAt: "desc" }, { id: "asc" }];
}

/**
 * A read cut off with its function stays EXTRACTING for good, and an upload
 * abandoned before it reached R2 stays UPLOADING. Called by the screens that
 * read bookings, as `expireStaleExtractions` is for POs. Never throws.
 */
export async function expireStaleBookings(now = new Date()): Promise<void> {
  try {
    await prisma.bookingConfirmation.updateMany({
      where: {
        status: BookingStatus.EXTRACTING,
        updatedAt: { lt: new Date(now.getTime() - EXTRACTION_TIMEOUT_MS) },
      },
      data: { status: BookingStatus.FAILED, error: EXTRACTION_TIMEOUT_ERROR },
    });
    // ponytail: rows only; an object PUT before the tab closed stays in R2.
    // Sweep `bookings/` keys with no row if storage ever matters.
    await prisma.bookingConfirmation.deleteMany({
      where: {
        status: BookingStatus.UPLOADING,
        uploadedAt: { lt: new Date(now.getTime() - 60 * 60_000) },
      },
    });
  } catch (cause) {
    console.error("[booking] expireStaleBookings", cause);
  }
}

const PERSON = { select: { name: true, image: true } } as const;

export async function listBookings(
  filters: BookingFilters,
  sort: { key: BookingSortKey; dir: SortDirection },
  take: number,
  skip: number,
) {
  await expireStaleBookings();
  const where = bookingWhere(filters);
  const [rows, total] = await Promise.all([
    prisma.bookingConfirmation.findMany({
      where,
      orderBy: bookingOrderBy(sort),
      take,
      skip,
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        status: true,
        error: true,
        bookingNumber: true,
        carrier: true,
        portOfLoading: true,
        portOfDischarge: true,
        etdPol: true,
        etaPod: true,
        uploadedAt: true,
        uploadedBy: PERSON,
        reviewedAt: true,
        reviewedBy: PERSON,
        shipment: { select: SHIPMENT_PREVIEW_SELECT },
      },
    }),
    prisma.bookingConfirmation.count({ where }),
  ]);
  return { rows, total };
}

/** Everyone who has uploaded one, for the "Uploaded by" select. */
export function listBookingUploaders() {
  return prisma.user.findMany({
    where: { bookingsUploaded: { some: { status: { not: BookingStatus.UPLOADING } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function loadBooking(id: string) {
  await expireStaleBookings();
  return prisma.bookingConfirmation.findFirst({
    where: { id, status: { not: BookingStatus.UPLOADING } },
    include: {
      uploadedBy: PERSON,
      reviewedBy: PERSON,
      shipment: { select: { id: true, reference: true } },
    },
  });
}

export type DuplicateBooking = {
  id: string;
  bookingNumber: string;
  uploadedBy: string;
  uploadedAt: string;
};

/**
 * Other booking confirmations carrying this booking number, oldest first, so
 * an upload can say it is not the first. Case is ignored; a blank number
 * matches nothing, since an unread booking is not a copy of anything.
 */
export async function findDuplicateBookings(
  bookingNumber: string | null | undefined,
  excludeId: string,
): Promise<DuplicateBooking[]> {
  const number = bookingNumber?.trim();
  if (!number) return [];
  const rows = await prisma.bookingConfirmation.findMany({
    where: {
      id: { not: excludeId },
      status: { not: BookingStatus.UPLOADING },
      bookingNumber: { equals: number, mode: "insensitive" },
    },
    orderBy: { uploadedAt: "asc" },
    take: 5,
    select: { id: true, bookingNumber: true, uploadedAt: true, uploadedBy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    bookingNumber: row.bookingNumber ?? number,
    uploadedBy: row.uploadedBy.name,
    uploadedAt: row.uploadedAt.toISOString(),
  }));
}
