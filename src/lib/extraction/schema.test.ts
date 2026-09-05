import { describe, expect, it } from "vitest";
import { PoExtractionSchema } from "@/lib/extraction/schema";

const sample = {
  poNumber: "PO-2026-0917",
  buyerName: "Acme Industrial Sdn Bhd",
  poDate: "2026-09-17",
  deliveryDate: "2026-10-01",
  currency: "MYR",
  buyerReference: "REQ-889",
  paymentTerms: "30 days",
  lineItems: [
    {
      description: "Stone lantern 60cm",
      quantity: 20,
      unit: "piece",
      unitPrice: 727.1613,
      amount: 14543.23,
    },
  ],
  subtotal: 14543.23,
  tax: 0,
  total: 14543.23,
  pageCount: 2,
  confidence: { overall: 92, fields: { poNumber: 99, lineItems: 84 } },
};

describe("PoExtractionSchema", () => {
  it("accepts a well-formed extraction", () => {
    expect(PoExtractionSchema.safeParse(sample).success).toBe(true);
  });

  it("defaults the currency to MYR", () => {
    const { currency: _drop, ...rest } = sample;
    void _drop;
    const parsed = PoExtractionSchema.parse(rest);
    expect(parsed.currency).toBe("MYR");
  });

  it("accepts nulls where the document gives nothing", () => {
    expect(
      PoExtractionSchema.safeParse({
        ...sample,
        deliveryDate: null,
        buyerReference: null,
        paymentTerms: null,
        lineItems: [{ ...sample.lineItems[0], unit: null }],
      }).success,
    ).toBe(true);
  });

  it("refuses an extraction with no line items", () => {
    expect(PoExtractionSchema.safeParse({ ...sample, lineItems: [] }).success).toBe(
      false,
    );
  });

  it("refuses a day-first date", () => {
    expect(PoExtractionSchema.safeParse({ ...sample, poDate: "17/09/2026" }).success).toBe(
      false,
    );
  });

  it("refuses a date that is not a date at all", () => {
    expect(PoExtractionSchema.safeParse({ ...sample, poDate: "soon" }).success).toBe(
      false,
    );
  });

  it("refuses a negative total", () => {
    expect(PoExtractionSchema.safeParse({ ...sample, total: -1 }).success).toBe(false);
  });

  it("refuses a zero quantity", () => {
    expect(
      PoExtractionSchema.safeParse({
        ...sample,
        lineItems: [{ ...sample.lineItems[0], quantity: 0 }],
      }).success,
    ).toBe(false);
  });

  it("refuses a confidence outside 0-100", () => {
    expect(
      PoExtractionSchema.safeParse({
        ...sample,
        confidence: { overall: 120, fields: {} },
      }).success,
    ).toBe(false);
  });

  it("refuses a fractional page count", () => {
    expect(PoExtractionSchema.safeParse({ ...sample, pageCount: 1.5 }).success).toBe(
      false,
    );
  });
});
