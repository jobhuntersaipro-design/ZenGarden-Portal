import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@/generated/prisma/client";
import { BookingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  ExtractionError,
  anthropic,
  readDocument,
} from "@/lib/extraction/extract-po";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

/**
 * What Claude returns for a booking confirmation (2026-10-08). Every field is
 * nullable: a BC with no transhipment prints no transhipment port, and a value
 * the page does not show must come back null rather than guessed.
 */
export const BookingExtractionSchema = z.object({
  /** First, so the model decides what it is reading before it fills one in. */
  documentKind: z.enum([
    "booking_confirmation",
    "bill_of_lading",
    "purchase_order",
    "invoice",
    "other",
  ]),
  bookingNumber: z.string().nullable(),
  carrier: z.string().nullable(),
  containers: z.string().nullable(),
  portOfLoading: z.string().nullable(),
  transhipmentPort: z.string().nullable(),
  portOfDischarge: z.string().nullable(),
  etdPol: isoDate.nullable(),
  etaPod: isoDate.nullable(),
  finalDestination: z.string().nullable(),
  etaFinalDestination: isoDate.nullable(),
  feederVessel: z.string().nullable(),
  motherVessel: z.string().nullable(),
  vesselTracking: z.string().nullable(),
});

export type BookingExtraction = z.infer<typeof BookingExtractionSchema>;

export const BOOKING_SYSTEM_PROMPT = `You read shipping booking confirmations and return structured data.

What it is. Decide documentKind first. A booking confirmation is a shipping
line's or freight forwarder's confirmation that space is booked on a vessel —
headed "Booking Confirmation", "Booking Advice", "Booking Acknowledgement" or
similar, carrying a booking number, ports and vessel details. A bill of lading,
a purchase order or an invoice is not one. Use "other" for anything else.

Copy, never guess. Return each value as the document prints it. A field the
document does not show is null; never derive one from another field.

Ports. Port of loading (POL) is where the cargo is loaded. Port of discharge
(POD) is where it comes off the last vessel. The transhipment port is where it
changes vessel between the two; null for a direct sailing, and several in order
joined by " / ". Final destination is the place of delivery when the document
prints one — copy it even when it is the same as the POD. Keep a port's name
as printed, with its country if printed.

Dates. Return every date as ISO, YYYY-MM-DD. Malaysian documents usually write
day-first, so 03/09/2026 is 3 September 2026, not 9 March. etdPol is the
estimated departure from the port of loading, etaPod the estimated arrival at
the port of discharge, etaFinalDestination the estimated arrival at the final
destination.

Vessels. Give a vessel as its name and voyage, as printed (e.g. "KOTA HALUAN
0123N"). The feeder vessel carries the first leg, from the port of loading to
the transhipment port; the mother vessel carries the main ocean leg to the port
of discharge. When there is only one vessel, it is the mother vessel and
feederVessel is null.

vesselTracking is the link or reference the document gives for tracking the
shipment or vessel — a web address, or a number it labels for tracking. Copy it
exactly. Null when the document gives none.

bookingNumber is the booking reference (Booking No., BKG No., Booking Ref.).
carrier is the shipping line. containers is the equipment booked, as count and
type, e.g. "2 x 40HC"; join several types with ", ".`;

/** The reason a refused upload shows. */
export const notABooking = (kind: BookingExtraction["documentKind"]) =>
  kind === "bill_of_lading"
    ? "This looks like a bill of lading, not a booking confirmation"
    : kind === "purchase_order"
      ? "This looks like a purchase order — upload it under Purchase Orders instead"
      : "This doesn't look like a booking confirmation";

export async function extractBookingConfirmation(
  bytes: Uint8Array,
  mimeType: string,
  client: Anthropic = anthropic,
): Promise<BookingExtraction> {
  const message = await readDocument({
    bytes,
    mimeType,
    system: BOOKING_SYSTEM_PROMPT,
    instruction: "Extract this booking confirmation.",
    format: BookingExtractionSchema,
    client,
  });
  if (!message.parsed_output) {
    throw new ExtractionError(
      "The document didn't come back as a booking confirmation — it may be a scan with no readable text",
    );
  }
  if (message.parsed_output.documentKind !== "booking_confirmation") {
    throw new ExtractionError(notABooking(message.parsed_output.documentKind));
  }
  return message.parsed_output;
}

/** A `@db.Date` from `YYYY-MM-DD`: UTC midnight is that calendar day. */
export const asDateColumn = (value: string | null) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

/**
 * Read one booking confirmation and write what came back. Shared by the upload
 * route and Try again. Never throws: a failed read is a state the row shows,
 * with its reason, and the fields can still be entered by hand.
 */
export async function runBookingExtraction({
  id,
  r2Key,
  mimeType,
  getBytes,
  extract = extractBookingConfirmation,
}: {
  id: string;
  r2Key: string;
  mimeType: string;
  getBytes: (key: string) => Promise<Uint8Array>;
  extract?: (bytes: Uint8Array, mimeType: string) => Promise<BookingExtraction>;
}): Promise<{ status: BookingStatus; error: string | null }> {
  await prisma.bookingConfirmation.update({
    where: { id },
    data: { status: BookingStatus.EXTRACTING, error: null },
  });
  try {
    const read = await extract(await getBytes(r2Key), mimeType);
    await prisma.bookingConfirmation.update({
      where: { id },
      data: {
        status: BookingStatus.NEEDS_REVIEW,
        rawJson: read as unknown as Prisma.InputJsonValue,
        bookingNumber: read.bookingNumber,
        carrier: read.carrier,
        containers: read.containers,
        portOfLoading: read.portOfLoading,
        transhipmentPort: read.transhipmentPort,
        portOfDischarge: read.portOfDischarge,
        etdPol: asDateColumn(read.etdPol),
        etaPod: asDateColumn(read.etaPod),
        finalDestination: read.finalDestination,
        etaFinalDestination: asDateColumn(read.etaFinalDestination),
        feederVessel: read.feederVessel,
        motherVessel: read.motherVessel,
        vesselTracking: read.vesselTracking,
      },
    });
    return { status: BookingStatus.NEEDS_REVIEW, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The extraction failed";
    console.error(`[booking] ${id} failed`, cause);
    await prisma.bookingConfirmation.update({
      where: { id },
      data: { status: BookingStatus.FAILED, error: message },
    });
    return { status: BookingStatus.FAILED, error: message };
  }
}
