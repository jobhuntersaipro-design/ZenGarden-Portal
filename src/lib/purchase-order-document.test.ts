import { describe, expect, it } from "vitest";
import {
  buildPoDocument,
  documentAgreesWithOrder,
} from "@/lib/purchase-order-document";
import type { CartLine } from "@/lib/queries/cart";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  sku: "ZEN-SC-2100-GM",
  name: "ZEN 2.1L — Goat's Milk",
  brand: "Zen Garden",
  variant: "Goat's Milk",
  packSize: 6,
  unit: "carton",
  cartons: 3,
  unitPrice: "225.50",
  amount: "676.50",
  pieces: 18,
  imageUrl: null,
  unavailable: false,
  ...over,
});

const supplier = {
  name: "Loving Hands",
  address: "1 Jalan Satu",
  email: "orders@lovinghands.my",
  phone: "+60 3-0000 0000",
};

const buyer = {
  name: "Acme Industrial Sdn Bhd",
  address: "12 Jalan Perindustrian 4\n47100 Puchong",
  contactName: "Aisha Rahman",
  email: "aisha@acme.test",
  paymentTerms: "30 days",
};

const build = (over: Partial<Parameters<typeof buildPoDocument>[0]> = {}) =>
  buildPoDocument({
    lines: [line()],
    subtotal: "676.50",
    buyer,
    supplier,
    buyerReference: null,
    ourReference: "W-2609-00007",
    requestedDate: null,
    notes: null,
    paymentTerms: "30 days",
    orderDate: "14 Sep 2026",
    ...over,
  });

describe("buildPoDocument", () => {
  it("totals the document from its own lines", () => {
    const doc = build({
      lines: [line(), line({ productId: "p2", sku: "ZEN-LV", amount: "756.00", cartons: 4 })],
      subtotal: "1432.50",
    });
    expect(doc.subtotal).toBe("1432.50");
    expect(doc.total).toBe("1432.50");
  });

  it("agrees to the cent with the figure the order is submitted at", () => {
    const doc = build({
      lines: [line({ amount: "676.50" }), line({ productId: "p2", amount: "158.40" })],
      subtotal: "834.90",
    });
    expect(documentAgreesWithOrder(doc, "834.90")).toBe(true);
  });

  it("reports a disagreement rather than drawing a document that contradicts the order", () => {
    const doc = build({ lines: [line({ amount: "676.50" })], subtotal: "999.99" });
    expect(documentAgreesWithOrder(doc, "999.99")).toBe(false);
  });

  it("prints the buyer's own PO number as the reference when they gave one", () => {
    const doc = build({ buyerReference: "ACME-PO-771" });
    expect(doc.reference).toBe("ACME-PO-771");
    // Ours still appears in the footer: it is what we file the order under.
    expect(doc.ourReference).toBe("W-2609-00007");
  });

  it("falls back to our reference when the buyer has no PO number", () => {
    expect(build({ buyerReference: "   " }).reference).toBe("W-2609-00007");
  });

  it("numbers the lines from one and carries the pack caption", () => {
    const doc = build();
    expect(doc.lines[0].position).toBe(1);
    expect(doc.lines[0].packCaption).toBe("6 per carton · 18 pieces");
  });

  it("leaves the pieces off a line whose pack size is unknown", () => {
    const doc = build({ lines: [line({ packSize: null, pieces: null })] });
    expect(doc.lines[0].packCaption).toBe("per carton");
  });

  it("joins each party's contact, and omits it when there is nothing to join", () => {
    expect(build().buyer.contact).toBe("Aisha Rahman · aisha@acme.test");
    expect(
      build({ buyer: { ...buyer, contactName: null, email: null } }).buyer.contact,
    ).toBeNull();
  });

  it("survives a buyer that could not be read", () => {
    const doc = build({ buyer: null });
    expect(doc.buyer).toEqual({ name: "—", address: null, contact: null });
  });

  it("falls back to a supplier name when the org settings hold none", () => {
    const doc = build({ supplier: { ...supplier, name: null } });
    expect(doc.supplier.name).toBe("Loving Hands");
  });

  it("treats blank notes and blank payment terms as absent", () => {
    const doc = build({ notes: "   ", paymentTerms: "  " });
    expect(doc.notes).toBeNull();
    expect(doc.paymentTerms).toBeNull();
  });

  it("keeps the currency at MYR unless told otherwise", () => {
    expect(build().currency).toBe("MYR");
  });
});
