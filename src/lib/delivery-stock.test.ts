import { describe, expect, it } from "vitest";
import {
  OUT_FOR_DELIVERY_REASON,
  deliveryProductName,
  deliveryStockError,
  describeStockMovement,
  onHandAfterDeliveries,
  planDeliveryDeduction,
  wholeCartons,
  type DeliveryLine,
  type StockOnHand,
} from "@/lib/delivery-stock";

const goat: StockOnHand = {
  id: "p-goat",
  name: "ZEN 2.1L — Goat's Milk",
  variant: "Goat's Milk",
  stockCartons: 10,
};

const lavender: StockOnHand = {
  id: "p-lav",
  name: "ZEN 2.1L — Lavender",
  variant: "Lavender",
  stockCartons: 5,
};

const line = (over: Partial<DeliveryLine> & Pick<DeliveryLine, "id" | "quantity">): DeliveryLine => ({
  position: 0,
  description: "ZEN 2.1L — Goat's Milk",
  productId: "p-goat",
  productName: "ZEN 2.1L — Goat's Milk",
  variant: "Goat's Milk",
  ...over,
});

describe("planDeliveryDeduction", () => {
  it("deducts one line and names the before and after", () => {
    const plan = planDeliveryDeduction([line({ id: "l1", quantity: "3" })], [goat]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.movements).toEqual([
      {
        lineItemId: "l1",
        productId: "p-goat",
        productName: "ZEN 2.1L — Goat's Milk",
        quantity: 3,
        beforeCartons: 10,
        afterCartons: 7,
      },
    ]);
    expect(plan.products).toEqual([
      { productId: "p-goat", beforeCartons: 10, afterCartons: 7 },
    ]);
  });

  it("sums several lines of one product, and logs each line", () => {
    const plan = planDeliveryDeduction(
      [
        line({ id: "l1", position: 0, quantity: "3.000" }),
        line({ id: "l2", position: 1, quantity: "4" }),
      ],
      [goat],
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.movements.map((row) => [row.quantity, row.beforeCartons, row.afterCartons])).toEqual([
      [3, 10, 7],
      [4, 7, 3],
    ]);
    expect(plan.products).toEqual([
      { productId: "p-goat", beforeCartons: 10, afterCartons: 3 },
    ]);
  });

  it("plans every product on a multi-line order", () => {
    const plan = planDeliveryDeduction(
      [
        line({ id: "l1", position: 0, quantity: "3" }),
        line({
          id: "l2",
          position: 1,
          quantity: "4",
          description: "ZEN 2.1L — Lavender",
          productId: "p-lav",
          productName: "ZEN 2.1L — Lavender",
          variant: "Lavender",
        }),
      ],
      [goat, lavender],
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.products).toEqual([
      { productId: "p-goat", beforeCartons: 10, afterCartons: 7 },
      { productId: "p-lav", beforeCartons: 5, afterCartons: 1 },
    ]);
  });

  it("refuses when one product is short, and names needed against available", () => {
    const plan = planDeliveryDeduction([line({ id: "l1", quantity: "3" })], [
      { ...goat, stockCartons: 1 },
    ]);
    expect(plan).toEqual({
      ok: false,
      error: deliveryStockError([
        "ZEN 2.1L — Goat's Milk needs 3 cartons, 1 available",
      ]),
    });
  });

  it("refuses the whole order when a second line would overdraw", () => {
    const plan = planDeliveryDeduction(
      [
        line({ id: "l1", position: 0, quantity: "6" }),
        line({ id: "l2", position: 1, quantity: "6" }),
      ],
      [goat],
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe(
      "Not enough stock to mark this order out for delivery. ZEN 2.1L — Goat's Milk needs 12 cartons, 10 available.",
    );
  });

  it("names every short product", () => {
    const plan = planDeliveryDeduction(
      [
        line({ id: "l1", position: 0, quantity: "3" }),
        line({
          id: "l2",
          position: 1,
          quantity: "4",
          productId: "p-lav",
          productName: lavender.name,
          variant: "Lavender",
          description: lavender.name,
        }),
      ],
      [
        { ...goat, stockCartons: 1 },
        { ...lavender, stockCartons: 2 },
      ],
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain("ZEN 2.1L — Goat's Milk needs 3 cartons, 1 available");
    expect(plan.error).toContain("ZEN 2.1L — Lavender needs 4 cartons, 2 available");
  });

  it("treats an uncounted product as unavailable, not as zero", () => {
    const plan = planDeliveryDeduction([line({ id: "l1", quantity: "3" })], [
      { ...goat, stockCartons: null },
    ]);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe(
      "Not enough stock to mark this order out for delivery. ZEN 2.1L — Goat's Milk needs 3 cartons, none counted.",
    );
  });

  it("refuses a line that is not linked to a product", () => {
    const plan = planDeliveryDeduction(
      [line({ id: "l1", quantity: "2", productId: null, productName: null, description: "Loose cream" })],
      [goat],
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toContain(`"Loose cream" isn't linked to a product`);
  });
});

describe("wholeCartons", () => {
  it("accepts a whole number written as a decimal", () => {
    expect(wholeCartons("3")).toEqual({ ok: true, cartons: 3 });
    expect(wholeCartons("3.000")).toEqual({ ok: true, cartons: 3 });
    expect(wholeCartons("0")).toEqual({ ok: true, cartons: 0 });
  });

  it("rejects a fraction", () => {
    expect(wholeCartons("2.5")).toEqual({ ok: false });
  });
});

describe("on-hand cache and the log sentence", () => {
  it("subtracts deliveries that happened after the count", () => {
    expect(onHandAfterDeliveries(80, 3)).toBe(77);
    expect(onHandAfterDeliveries(80, 0)).toBe(80);
  });

  it("does not repeat a variant the name already carries", () => {
    expect(deliveryProductName("ZEN 2.1L — Goat's Milk", "Goat's Milk")).toBe(
      "ZEN 2.1L — Goat's Milk",
    );
    expect(deliveryProductName("Shower cream", "Papaya")).toBe("Shower cream — Papaya");
  });

  it("records the reason in the history sentence", () => {
    expect(
      describeStockMovement({
        quantity: 3,
        beforeCartons: 10,
        afterCartons: 7,
        poNumber: "PO-100",
        reason: OUT_FOR_DELIVERY_REASON,
      }),
    ).toBe("3 cartons out for delivery, 10 → 7, PO-100. Out for Delivery");
  });
});
