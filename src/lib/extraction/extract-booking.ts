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

What it is. Decide documentKind first. A booking confirmation is a freight
forwarder's or shipping line's confirmation that space is booked on a vessel —
headed "Booking Confirmation", "Booking", "Booking Advice" or similar, carrying
a booking reference, ports and vessel details. Most come from Malaysian
forwarders (Oceanwave Logistics, The Ark Logistics and others) for Zen Garden,
which also appears as Loving Hands. A bill of lading, a purchase order or an
invoice is not one. Use "other" for anything else.

Copy, never guess. Return each value as the document prints it. A field the
document leaves blank, or fills with "-", "TBA" or "N/A", is null. Never derive
a value from another field.

bookingNumber is the carrier's booking reference: "Carrier BKG Ref",
"Booking Ref", "Booking No.", "BKG No.". Not the forwarder's job number and not
a house or co-load BL reference.

carrier is the shipping line, as printed ("Shipping Line: CMA CGM MALAYSIA SDN
BHD"). Not the forwarder who issued the document, not a forwarding agent and
not a shipping agent code. Null when no shipping line is named.

containers is the equipment booked, as printed — under "No. of Container",
"Container", "Equipment", or "Packages" when that line holds a container count
and type, e.g. "1X40HC", "1 X 20'GP". Join several lines with ", ". Not the
number of cartons.

Ports. Port of loading (POL) is where the cargo is loaded. Port of discharge
(POD) is where it comes off the vessel; a "Port of Destination" is the POD when
the document prints no separate port of discharge. The transhipment port is
where the cargo changes vessel; several in order joined by " / ". Final
destination is only what the document labels "Final Destination" or "Place of
Delivery" — copy it even when it is the same as the POD. Keep a port's name as
printed, with its country or state if printed.

Dates. Return every date as ISO, YYYY-MM-DD. These documents write dates
day-first, so 03/09/2026 is 3 September 2026, not 9 March. etdPol is the
estimated departure from the port of loading ("ETD POL", "ETD" beside the
POL). etaPod is the estimated arrival at the port of discharge, including a
date labelled with that port's name, e.g. "ETA SANDAKAN" when Sandakan is the
POD. etaFinalDestination is the estimated arrival at the final destination.
A vessel's ETA at the port of loading ("Vessel ETA POL", "ETA P/KLANG"), a
closing time and a cut-off are not ETD POL; leave etdPol null if no departure
date is printed.

Vessels. Give a vessel as its name and voyage, as printed ("HG SKYLINE V.
CS10G0S89", "DANUM 172 / 72123W"). When the document labels a vessel "Feeder"
or "Mother", use its label even when the other one is blank. When it prints
vessels without those labels: with a transhipment, the vessel to the
transhipment port is the feeder and the vessel on to the POD is the mother;
with one vessel and no transhipment, that vessel is the feeder and
motherVessel is null.

vesselTracking is what the vessel call is tracked by: the SCN (ship call
number) and Vessel ID, written "SCN 269IOC / Vessel ID FCNA00834" from either
"SCN No: 269IOC" and "Vessel ID: FCNA00834" or "SCN / Vessel ID: 269IOC /
FCNA00834". If only one is printed, give just that one with its label. If the
document instead gives a tracking web address, copy the address. Null when it
gives neither.`;

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
