import { describe, expect, it } from "vitest";
import { emailOrderName, orderIdentity, orderLabel } from "@/lib/order-identity";

/**
 * Order ID and PO number are never interchangeable (2026-09-17): a shop
 * order's `W-…` is ours, a PO number is the buyer's, and a blank one stays
 * blank rather than borrowing the other.
 */
describe("orderIdentity", () => {
  it("gives a shop order its Order ID, and the buyer's PO where they typed one", () => {
    expect(
      orderIdentity({
        poNumber: null,
        buyerReference: "ACME-771",
        webOrder: { reference: "W-2609-00014" },
      }),
    ).toEqual({ orderId: "W-2609-00014", poNumber: "ACME-771" });
  });

  it("leaves a shop order's PO number blank when the buyer gave none", () => {
    expect(
      orderIdentity({
        poNumber: null,
        buyerReference: "  ",
        webOrder: { reference: "W-2609-00014" },
      }),
    ).toEqual({ orderId: "W-2609-00014", poNumber: null });
  });

  it("gives a scan its printed PO number and no Order ID", () => {
    expect(
      orderIdentity({ poNumber: "SVPPPO26090009", buyerReference: null, webOrder: null }),
    ).toEqual({ orderId: null, poNumber: "SVPPPO26090009" });
  });

  it("ignores a scan's buyerReference, which is the retired extraction field", () => {
    expect(
      orderIdentity({ poNumber: null, buyerReference: "REF-1", webOrder: null }),
    ).toEqual({ orderId: null, poNumber: null });
  });

  it("keeps a PO number typed onto a shop order before the field was locked", () => {
    expect(
      orderIdentity({
        poNumber: "ACME-TYPED",
        buyerReference: null,
        webOrder: { reference: "W-2609-00014" },
      }),
    ).toEqual({ orderId: "W-2609-00014", poNumber: "ACME-TYPED" });
  });
});

describe("orderLabel", () => {
  it("names which identifier it is showing", () => {
    expect(orderLabel({ orderId: "W-2609-00014", poNumber: "ACME-771" })).toBe(
      "Order ID W-2609-00014",
    );
    expect(orderLabel({ orderId: null, poNumber: "SVPPPO26090009" })).toBe(
      "PO number SVPPPO26090009",
    );
    expect(orderLabel({ orderId: null, poNumber: null })).toBe("Purchase order");
  });
});

describe("emailOrderName", () => {
  /**
   * The buyer's own PO number names the order in an email's subject and
   * heading (2026-09-20) — it is what they filed it under.
   */
  it("prefers the buyer's PO number", () => {
    expect(emailOrderName("ACME-PO-771", "W-2609-00014")).toBe("ACME-PO-771");
  });

  /**
   * Falls back to the Order ID rather than a dash. Orders placed before the PO
   * number became required have none, and they can still be emailed about
   * whenever their delivery date moves — "your order —" is unfindable.
   */
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["whitespace alone", "   "],
  ])("falls back to the Order ID when the PO number is %s", (_label, poNumber) => {
    expect(emailOrderName(poNumber, "W-2609-00014")).toBe("W-2609-00014");
  });

  it("trims what it returns", () => {
    expect(emailOrderName("  ACME-PO-771  ", "W-2609-00014")).toBe("ACME-PO-771");
  });
});
