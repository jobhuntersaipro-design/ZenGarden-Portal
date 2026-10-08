import { z } from "zod";
import { optionalText } from "@/lib/validation/common";

/** A real calendar day as `YYYY-MM-DD`, or blank; "2026-02-31" is refused. */
const optionalDay = (label: string) =>
  optionalText(10).refine(
    (value) =>
      value === null ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().startsWith(value)),
    `${label} isn't a date.`,
  );

/**
 * The reviewer's edits to one booking confirmation. Every field may be blank:
 * a BC prints what it prints, and "nobody has recorded this" stays null.
 */
export const bookingFieldsSchema = z.object({
  bookingNumber: optionalText(100),
  carrier: optionalText(100),
  containers: optionalText(200),
  portOfLoading: optionalText(200),
  transhipmentPort: optionalText(200),
  portOfDischarge: optionalText(200),
  etdPol: optionalDay("ETD POL"),
  etaPod: optionalDay("ETA POD"),
  finalDestination: optionalText(200),
  etaFinalDestination: optionalDay("ETA final destination"),
  feederVessel: optionalText(200),
  motherVessel: optionalText(200),
  vesselTracking: optionalText(500),
});

export type BookingFieldsInput = z.input<typeof bookingFieldsSchema>;
export type BookingFields = z.output<typeof bookingFieldsSchema>;

/** The form's fields in reading order, so the screen and the schema agree. */
export const BOOKING_FIELDS: {
  key: keyof BookingFields;
  label: string;
  date?: true;
}[] = [
  { key: "bookingNumber", label: "Booking number" },
  { key: "carrier", label: "Carrier" },
  { key: "containers", label: "Containers" },
  { key: "portOfLoading", label: "Port of loading" },
  { key: "transhipmentPort", label: "Transhipment port" },
  { key: "portOfDischarge", label: "Port of discharge" },
  { key: "etdPol", label: "ETD POL", date: true },
  { key: "etaPod", label: "ETA POD", date: true },
  { key: "finalDestination", label: "Final destination" },
  { key: "etaFinalDestination", label: "ETA final destination", date: true },
  { key: "feederVessel", label: "Feeder vessel" },
  { key: "motherVessel", label: "Mother vessel" },
  { key: "vesselTracking", label: "Vessel tracking" },
];
