import { describe, expect, it } from "vitest";
import { draftReducer } from "@/components/review/draft-reducer";
import type { PoDraft } from "@/lib/validation/purchase-orders";

const base: PoDraft = {
  poNumber: "PO-1",
  buyerId: "b1",
  newBuyerName: null,
  poDate: "2026-09-17",
  deliveryDate: null,
  currency: "MYR",
  buyerReference: null,
  paymentTerms: null,
  lineItems: [
    {
      description: "Stone lantern",
      productId: null,
      quantity: "2",
      unit: "piece",
      unitPrice: "100.00",
      amount: "200.00",
    },
  ],
  subtotal: "200.00",
  tax: "0.00",
  total: "200.00",
};

describe("draftReducer", () => {
  it("recomputes the amount when quantity changes", () => {
    const next = draftReducer(base, {
      type: "line",
      index: 0,
      field: "quantity",
      value: "3",
    });
    expect(next.lineItems[0].amount).toBe("300.00");
  });

  it("recomputes the amount when the unit price changes", () => {
    const next = draftReducer(base, {
      type: "line",
      index: 0,
      field: "unitPrice",
      value: "150.00",
    });
    expect(next.lineItems[0].amount).toBe("300.00");
  });

  it("stops recomputing once the amount is typed by hand", () => {
    const pinned = draftReducer(base, {
      type: "line",
      index: 0,
      field: "amount",
      value: "180.00",
    });
    expect(pinned.lineItems[0].amountManual).toBe(true);

    const afterQuantity = draftReducer(pinned, {
      type: "line",
      index: 0,
      field: "quantity",
      value: "10",
    });
    // The document's printed amount survives; only the quantity moved.
    expect(afterQuantity.lineItems[0].amount).toBe("180.00");
    expect(afterQuantity.lineItems[0].quantity).toBe("10");
  });

  it("fills an empty description from the chosen product but never overwrites one", () => {
    const empty = draftReducer(
      { ...base, lineItems: [{ ...base.lineItems[0], description: "" }] },
      { type: "lineProduct", index: 0, productId: "p1", name: "Granite step", unit: "piece" },
    );
    expect(empty.lineItems[0].description).toBe("Granite step");

    const typed = draftReducer(base, {
      type: "lineProduct",
      index: 0,
      productId: "p1",
      name: "Granite step",
      unit: "piece",
    });
    expect(typed.lineItems[0].description).toBe("Stone lantern");
    expect(typed.lineItems[0].productId).toBe("p1");
  });

  it("swaps buyer id for a new buyer name and back", () => {
    const created = draftReducer(base, {
      type: "buyer",
      buyerId: null,
      newBuyerName: "New Buyer Sdn Bhd",
    });
    expect(created.buyerId).toBeNull();
    expect(created.newBuyerName).toBe("New Buyer Sdn Bhd");

    const chosen = draftReducer(created, {
      type: "buyer",
      buyerId: "b2",
      newBuyerName: null,
    });
    expect(chosen.buyerId).toBe("b2");
    expect(chosen.newBuyerName).toBeNull();
  });

  it("adds and removes lines", () => {
    const added = draftReducer(base, { type: "addLine" });
    expect(added.lineItems).toHaveLength(2);
    const removed = draftReducer(added, { type: "removeLine", index: 0 });
    expect(removed.lineItems).toHaveLength(1);
    expect(removed.lineItems[0].description).toBe("");
  });
});
