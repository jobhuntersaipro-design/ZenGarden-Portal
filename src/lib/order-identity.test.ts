import { describe, expect, it } from "vitest";
import { orderIdentity, orderLabel } from "@/lib/order-identity";

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
