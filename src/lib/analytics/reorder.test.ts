import { describe, expect, it } from "vitest";
import { reorderSignals } from "@/lib/analytics/reorder";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const NOW = new Date("2026-09-17T04:00:00Z");

const order = (
  poDate: string,
  products: string[],
): AnalyticsOrder => ({
  id: `po-${poDate}`,
  poNumber: "PO-1",
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date(`${poDate}T04:00:00Z`),
  total: 100,
  stage: "ORDER_PLACED",
  lineItems: products.map((productId) => ({
    productId,
    productName: productId.toUpperCase(),
    quantity: 1,
    amount: 100,
  })),
  stageEvents: [],
});

/** Four purchases 30 days apart, the last `daysAgo` before NOW. */
const monthly = (product: string, daysAgo: number) => {
  const last = NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000;
  return [90, 60, 30, 0].map((back) =>
    order(new Date(last - back * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), [
      product,
    ]),
  );
};

describe("reorderSignals", () => {
  it("needs four purchases before it will predict anything", () => {
    // Three purchases is an accident of timing, not a rhythm.
    const three = [
      order("2026-06-01", ["p1"]),
      order("2026-07-01", ["p1"]),
      order("2026-08-01", ["p1"]),
    ];
    expect(reorderSignals(three, NOW).signals).toEqual([]);

    const four = [...three, order("2026-09-01", ["p1"])];
    expect(reorderSignals(four, NOW).signals).toHaveLength(1);
  });

  it("computes the mean interval and the due date from it", () => {
    const signal = reorderSignals(monthly("p1", 0), NOW).signals[0];
    expect(signal.purchases).toBe(4);
    expect(signal.intervalDays).toBeCloseTo(30, 0);
    // Bought today, so due in about thirty days.
    expect(signal.daysPastDue).toBeCloseTo(-30, 0);
  });

  it("badges more than a week past due as overdue", () => {
    const signal = reorderSignals(monthly("p1", 45), NOW).signals[0];
    expect(signal.badge).toBe("overdue");
    expect(signal.daysPastDue).toBeGreaterThan(7);
  });

  it("badges within a week either side as due now", () => {
    expect(reorderSignals(monthly("p1", 33), NOW).signals[0].badge).toBe("due-now");
    expect(reorderSignals(monthly("p1", 27), NOW).signals[0].badge).toBe("due-now");
  });

  it("badges anything further out as simply due", () => {
    expect(reorderSignals(monthly("p1", 10), NOW).signals[0].badge).toBe("due");
  });

  it("counts every overdue item, not just the five it shows", () => {
    const history = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].flatMap((product) =>
      monthly(product, 45),
    );
    const result = reorderSignals(history, NOW);
    expect(result.signals).toHaveLength(5);
    expect(result.overdueCount).toBe(7);
  });

  it("puts the most pressing first", () => {
    const history = [...monthly("soon", 10), ...monthly("late", 60)];
    expect(reorderSignals(history, NOW).signals[0].productId).toBe("late");
  });

  it("ignores unmatched line items", () => {
    const history = [
      order("2026-06-01", []),
      order("2026-07-01", []),
      order("2026-08-01", []),
      order("2026-09-01", []),
    ];
    expect(reorderSignals(history, NOW).signals).toEqual([]);
  });
});
