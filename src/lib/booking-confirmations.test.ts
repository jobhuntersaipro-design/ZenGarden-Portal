import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { ANTHROPIC_API_KEY: "test-key", EXTRACTION_MODEL: "claude-sonnet-5" },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { extractBookingConfirmation, BOOKING_SYSTEM_PROMPT } = await import(
  "@/lib/extraction/extract-booking"
);
const { bookingOrderBy, bookingWhere } = await import("@/lib/queries/booking-confirmations");
const { bookingFieldsSchema } = await import("@/lib/validation/booking-confirmations");

const read = {
  documentKind: "booking_confirmation",
  bookingNumber: "MYPKG1234567",
  carrier: "Maersk",
  containers: "2 x 40HC",
  portOfLoading: "Port Klang, Malaysia",
  transhipmentPort: "Singapore",
  portOfDischarge: "Jebel Ali, UAE",
  etdPol: "2026-10-12",
  etaPod: "2026-10-30",
  finalDestination: null,
  etaFinalDestination: null,
  feederVessel: "KOTA HALUAN 0123N",
  motherVessel: "MAERSK EMDEN 441W",
  vesselTracking: "https://www.maersk.com/tracking/MYPKG1234567",
};

const clientReturning = (parsed_output: unknown) => {
  const parse = vi.fn().mockResolvedValue({
    parsed_output,
    model: "m",
    usage: { input_tokens: 1, output_tokens: 1 },
  });
  return { client: { messages: { parse } } as never, parse };
};

describe("reading a booking confirmation", () => {
  it("returns the fields, asked with the booking prompt", async () => {
    const { client, parse } = clientReturning(read);
    const result = await extractBookingConfirmation(new Uint8Array([1]), "application/pdf", client);
    expect(result.motherVessel).toBe("MAERSK EMDEN 441W");
    expect(parse.mock.calls[0][0].system).toBe(BOOKING_SYSTEM_PROMPT);
  });

  it("refuses anything that is not a booking confirmation", async () => {
    const { client } = clientReturning({ ...read, documentKind: "purchase_order" });
    await expect(
      extractBookingConfirmation(new Uint8Array([1]), "image/png", client),
    ).rejects.toThrow(/purchase order/);
  });
});

describe("the booking list's query", () => {
  it("never lists an upload still on its way to storage", () => {
    expect(bookingWhere({ status: "all" }).status).toEqual({ not: "UPLOADING" });
    expect(bookingWhere({ status: "needs-review" }).status).toBe("NEEDS_REVIEW");
  });

  it("searches every text field, the file name included", () => {
    const where = bookingWhere({ status: "all", q: "emden" });
    const fields = (where.OR ?? []).flatMap((clause) => Object.keys(clause));
    expect(fields).toContain("motherVessel");
    expect(fields).toContain("originalName");
  });

  it("sorts a blank last in both directions", () => {
    for (const dir of ["asc", "desc"] as const) {
      expect(bookingOrderBy({ key: "etdPol", dir })[0]).toEqual({
        etdPol: { sort: dir, nulls: "last" },
      });
    }
  });
});

describe("the reviewer's fields", () => {
  const blank = Object.fromEntries(Object.keys(read).filter((k) => k !== "documentKind").map((k) => [k, ""]));

  it("stores a blank as null", () => {
    const parsed = bookingFieldsSchema.parse({ ...blank, carrier: "  Maersk " });
    expect(parsed.carrier).toBe("Maersk");
    expect(parsed.etdPol).toBeNull();
  });

  it("refuses a day that does not exist", () => {
    expect(bookingFieldsSchema.safeParse({ ...blank, etaPod: "2026-02-31" }).success).toBe(false);
  });
});
