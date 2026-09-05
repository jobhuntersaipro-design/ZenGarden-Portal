import { describe, expect, it } from "vitest";
import { productMix } from "@/lib/analytics/product-mix";
import { unitsPerBucket } from "@/lib/analytics/product-trend";
import { monthlyTotals } from "@/lib/analytics/sparkline";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const order = (
  poDate: string,
  lines: { id: string | null; qty: number; amount: number }[],
): AnalyticsOrder => ({
  id: `po-${poDate}-${Math.random()}`,
  poNumber: "PO-1",
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date(`${poDate}T04:00:00Z`),
  total: lines.reduce((sum, line) => sum + line.amount, 0),
  stage: "ORDER_PLACED",
  lineItems: lines.map((line) => ({
    productId: line.id,
    productName: line.id ? line.id.toUpperCase() : null,
    quantity: line.qty,
    amount: line.amount,
  })),
  stageEvents: [],
});

describe("productMix", () => {
  it("ranks by value when asked for value", () => {
    const mix = productMix(
      [
        order("2026-09-01", [{ id: "cheap", qty: 100, amount: 100 }]),
        order("2026-09-02", [{ id: "dear", qty: 1, amount: 900 }]),
      ],
      "value",
    );
    expect(mix[0].label).toBe("DEAR");
    expect(mix[0].share).toBe(90);
  });

  it("ranks by units when asked for quantity, which can reverse the order", () => {
    const mix = productMix(
      [
        order("2026-09-01", [{ id: "cheap", qty: 100, amount: 100 }]),
        order("2026-09-02", [{ id: "dear", qty: 1, amount: 900 }]),
      ],
      "qty",
    );
    expect(mix[0].label).toBe("CHEAP");
  });

  it("folds past the top five into Other", () => {
    const lines = Array.from({ length: 8 }, (_, index) => ({
      id: `p${index}`,
      qty: 1,
      amount: 10 * (index + 1),
    }));
    const mix = productMix([order("2026-09-01", lines)], "value");
    expect(mix).toHaveLength(6);
    expect(mix[5].label).toBe("Other (3)");
  });
});

describe("unitsPerBucket", () => {
  const FROM = new Date("2026-09-01T00:00:00Z");
  const TO = new Date("2026-09-03T15:00:00Z");

  it("counts units per product per bucket", () => {
    const points = unitsPerBucket(
      [
        order("2026-09-01", [{ id: "p1", qty: 3, amount: 30 }]),
        order("2026-09-01", [{ id: "p1", qty: 2, amount: 20 }]),
        order("2026-09-03", [{ id: "p2", qty: 7, amount: 70 }]),
      ],
      ["p1", "p2"],
      FROM,
      TO,
      "day",
    );
    expect(points[0].p1).toBe(5);
    expect(points[2].p2).toBe(7);
  });

  it("keeps an empty bucket at zero for every selected product", () => {
    const points = unitsPerBucket(
      [order("2026-09-01", [{ id: "p1", qty: 3, amount: 30 }])],
      ["p1", "p2"],
      FROM,
      TO,
      "day",
    );
    expect(points).toHaveLength(3);
    expect(points[1]).toMatchObject({ p1: 0, p2: 0 });
  });

  it("ignores products that were not selected", () => {
    const points = unitsPerBucket(
      [order("2026-09-01", [{ id: "other", qty: 9, amount: 90 }])],
      ["p1"],
      FROM,
      TO,
      "day",
    );
    expect(points[0].p1).toBe(0);
    expect(points[0].other).toBeUndefined();
  });
});

describe("monthlyTotals", () => {
  it("gives one point per month across the range, empty months included", () => {
    const totals = monthlyTotals(
      [order("2026-07-05", [{ id: "p1", qty: 1, amount: 500 }])],
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-09-30T00:00:00Z"),
    );
    expect(totals).toEqual([500, 0, 0]);
  });
});
