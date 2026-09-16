import { describe, expect, it } from "vitest";
import { renderPurchaseOrderPdf } from "@/lib/pdf/purchase-order";
import type { PoDocumentData } from "@/lib/purchase-order-document";

/**
 * The renderer is exercised for real — no mock — because the failure it can
 * have is a layout engine that will not load, and only running it proves it
 * does. What is asserted is that bytes come back and that they are a PDF; how
 * the page *looks* is checked by eye against the on-screen preview, which is
 * what §7 of the spec records.
 */
const document: PoDocumentData = {
  reference: "ACME-PO-771",
  ourReference: "W-2609-00015",
  orderDate: "15 Sep 2026",
  requestedDate: "30 Sep 2026",
  deliveryDate: null,
  paymentTerms: "45 days",
  currency: "MYR",
  buyer: {
    name: "Acme Industrial Sdn Bhd",
    address: "12 Jalan Perindustrian\n40150 Shah Alam\nSelangor",
    contact: "Aisha Rahman · orders@acme.test",
  },
  supplier: { name: "Zen Garden", address: null, contact: null },
  lines: [
    {
      position: 1,
      sku: "ZEN-SC-2100-GM-VN",
      description: "ZEN 2.1L — Goat's Milk",
      packCaption: "6 per carton · 18 pieces",
      cartons: 3,
      unitPrice: "220.50",
      amount: "661.50",
    },
    {
      position: 2,
      sku: "ZEN-HW-0500-LV",
      description: "H/WASH 500ML — Lavender",
      packCaption: "24 per carton · 24 pieces",
      cartons: 1,
      unitPrice: "142.00",
      amount: "142.00",
    },
  ],
  subtotal: "803.50",
  tax: null,
  total: "803.50",
  notes: "Please deliver to the rear gate before noon.",
};

describe("renderPurchaseOrderPdf", () => {
  it("renders a PDF", async () => {
    const bytes = await renderPurchaseOrderPdf(document, "Sent to our team.");
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(2000);
  }, 30_000);

  it("renders a confirmed order, whose meta strip carries a fifth cell", async () => {
    const bytes = await renderPurchaseOrderPdf(
      { ...document, deliveryDate: "2 Oct 2026" },
      "Confirmed by our team.",
    );
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("renders an order carrying tax, and one with no notes or contact", async () => {
    const bytes = await renderPurchaseOrderPdf(
      {
        ...document,
        tax: "48.21",
        total: "851.71",
        notes: null,
        requestedDate: null,
        paymentTerms: null,
        buyer: { name: "Acme Industrial Sdn Bhd", address: null, contact: null },
      },
      "Confirmed by our team.",
    );
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("renders an order long enough to run to a second page", async () => {
    // The line header is `fixed` and every row is `wrap={false}`, so a long
    // order must still produce a file rather than throwing on pagination.
    const lines = Array.from({ length: 40 }, (_, index) => ({
      ...document.lines[0],
      position: index + 1,
      sku: `ZEN-SC-2100-${index}`,
    }));
    const bytes = await renderPurchaseOrderPdf(
      { ...document, lines },
      "Sent to our team.",
    );
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(3000);
  }, 30_000);
});
