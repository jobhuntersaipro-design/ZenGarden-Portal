import { describe, expect, it } from "vitest";
import { priceDrift } from "@/lib/analytics/price-drift";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const order = (
  lines: { productId: string | null; name?: string; quantity: number; amount: number }[],
): AnalyticsOrder => ({
  id: `po-${Math.random()}`,
  poNumber: "PO-1",
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date("2026-09-01T04:00:00Z"),
  total: 0,
  stage: "ORDER_PLACED",
  lineItems: lines.map((line) => ({
    productId: line.productId,
    productName: line.name ?? line.productId,
    quantity: line.quantity,
    amount: line.amount,
  })),
  stageEvents: [],
});

describe("priceDrift", () => {
  it("uses the billed unit price, so a discount shows up", () => {
    // 10 units for 900 is 90 each, not the 100 list price.
    const result = priceDrift(
      [order([{ productId: "p1", name: "Stone lantern", quantity: 10, amount: 900 }])],
      [order([{ productId: "p1", name: "Stone lantern", quantity: 10, amount: 1000 }])],
    );
    expect(result.rows[0]).toMatchObject({
      previousPrice: 100,
      currentPrice: 90,
      deltaPercent: -10,
    });
  });

  it("averages across every line in the period", () => {
    const result = priceDrift(
      [
        order([{ productId: "p1", quantity: 10, amount: 1000 }]),
        order([{ productId: "p1", quantity: 10, amount: 1400 }]),
      ],
      [order([{ productId: "p1", quantity: 1, amount: 100 }])],
    );
    // 2400 over 20 units is 120.
    expect(result.rows[0].currentPrice).toBe(120);
  });

  it("only compares products sold in both periods", () => {
    const result = priceDrift(
      [
        order([{ productId: "p1", quantity: 1, amount: 100 }]),
        order([{ productId: "new", quantity: 1, amount: 50 }]),
      ],
      [order([{ productId: "p1", quantity: 1, amount: 80 }])],
    );
    expect(result.comparedCount).toBe(1);
    expect(result.rows.map((row) => row.productId)).toEqual(["p1"]);
  });

  it("sorts by the size of the move, in either direction", () => {
    const result = priceDrift(
      [
        order([{ productId: "small", quantity: 1, amount: 105 }]),
        order([{ productId: "big", quantity: 1, amount: 50 }]),
      ],
      [
        order([{ productId: "small", quantity: 1, amount: 100 }]),
        order([{ productId: "big", quantity: 1, amount: 100 }]),
      ],
    );
    // A 50% fall outranks a 5% rise.
    expect(result.rows.map((row) => row.productId)).toEqual(["big", "small"]);
  });

  it("counts risers and fallers", () => {
    const result = priceDrift(
      [
        order([{ productId: "up", quantity: 1, amount: 110 }]),
        order([{ productId: "down", quantity: 1, amount: 90 }]),
        order([{ productId: "flat", quantity: 1, amount: 100 }]),
      ],
      [
        order([{ productId: "up", quantity: 1, amount: 100 }]),
        order([{ productId: "down", quantity: 1, amount: 100 }]),
        order([{ productId: "flat", quantity: 1, amount: 100 }]),
      ],
    );
    expect(result.upCount).toBe(1);
    expect(result.downCount).toBe(1);
    expect(result.comparedCount).toBe(3);
  });

  it("ignores unmatched lines and zero quantities", () => {
    const result = priceDrift(
      [
        order([
          { productId: null, quantity: 5, amount: 500 },
          { productId: "p1", quantity: 0, amount: 0 },
        ]),
      ],
      [order([{ productId: "p1", quantity: 1, amount: 100 }])],
    );
    expect(result.rows).toEqual([]);
  });

  it("caps the list at six rows", () => {
    const lines = (multiplier: number) =>
      Array.from({ length: 9 }, (_, index) => ({
        productId: `p${index}`,
        quantity: 1,
        amount: 100 * multiplier * (index + 1),
      }));
    const result = priceDrift([order(lines(2))], [order(lines(1))]);
    expect(result.rows).toHaveLength(6);
    expect(result.comparedCount).toBe(9);
  });
});
