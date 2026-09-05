import { describe, expect, it } from "vitest";
import { kpis, salesSeries } from "@/lib/analytics/sales";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const order = (
  poDate: string,
  total: number,
  buyerId = "b1",
  buyerName = "Acme Industrial Sdn Bhd",
): AnalyticsOrder => ({
  id: `po-${poDate}-${total}`,
  poNumber: "PO-1",
  buyerId,
  buyerName,
  // Noon KL, so the date is unambiguous.
  poDate: new Date(`${poDate}T04:00:00Z`),
  total,
  stage: "ORDER_PLACED",
  lineItems: [],
  stageEvents: [],
});

const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-09-05T15:00:00Z");

describe("salesSeries", () => {
  it("keeps empty buckets as zero points rather than skipping them", () => {
    // Skipping empties draws a dead week the same width as a busy one.
    const series = salesSeries([order("2026-09-01", 100)], FROM, TO, "day");
    expect(series.points).toHaveLength(5);
    expect(series.points.map((p) => p.total)).toEqual([100, 0, 0, 0, 0]);
  });

  it("sums totals and counts per bucket", () => {
    const series = salesSeries(
      [order("2026-09-02", 100), order("2026-09-02", 50), order("2026-09-04", 25)],
      FROM,
      TO,
      "day",
    );
    expect(series.points[1]).toMatchObject({ total: 150, count: 2 });
    expect(series.points[3]).toMatchObject({ total: 25, count: 1 });
    expect(series.total).toBe(175);
    expect(series.count).toBe(3);
  });

  it("averages over every bucket, empty ones included", () => {
    // "RM x per day" has to mean per day, not per day that had sales.
    const series = salesSeries([order("2026-09-01", 100)], FROM, TO, "day");
    expect(series.average).toBe(20);
  });

  it("takes min over buckets with sales, never an empty one", () => {
    const series = salesSeries(
      [order("2026-09-01", 100), order("2026-09-03", 40)],
      FROM,
      TO,
      "day",
    );
    expect(series.max?.total).toBe(100);
    expect(series.min?.total).toBe(40);
    expect(series.min?.key).toBe("2026-09-03");
  });

  it("has no max or min when nothing sold", () => {
    const series = salesSeries([], FROM, TO, "day");
    expect(series.max).toBeNull();
    expect(series.min).toBeNull();
    expect(series.total).toBe(0);
  });

  it("rolls days into weeks at weekly aggregation", () => {
    const series = salesSeries(
      [order("2026-09-01", 100), order("2026-09-03", 40)],
      FROM,
      TO,
      "week",
    );
    // 1 and 3 Sep 2026 are both in the week beginning Monday 31 Aug.
    expect(series.points).toHaveLength(1);
    expect(series.points[0].total).toBe(140);
  });

  it("ignores an order that falls outside the range", () => {
    const series = salesSeries([order("2026-10-01", 999)], FROM, TO, "day");
    expect(series.total).toBe(0);
  });
});

describe("kpis", () => {
  const current = [
    order("2026-09-01", 100, "b1", "Acme"),
    order("2026-09-02", 300, "b2", "Bluewave"),
    order("2026-09-03", 100, "b1", "Acme"),
  ];

  it("totals sales, counts orders and averages them", () => {
    const result = kpis(current, []);
    expect(result.totalSales).toBe(500);
    expect(result.orderCount).toBe(3);
    expect(result.averageOrder).toBeCloseTo(166.67, 2);
  });

  it("picks the top buyer by value, not by order count", () => {
    // Acme has two orders; Bluewave has one worth more.
    const result = kpis(current, []);
    expect(result.topBuyer?.name).toBe("Bluewave");
    expect(result.topBuyer?.share).toBe(60);
  });

  it("computes the delta against the previous period", () => {
    const result = kpis(current, [order("2026-08-01", 400)]);
    expect(result.deltaPercent).toBe(25);
  });

  it("reports a negative delta", () => {
    const result = kpis(current, [order("2026-08-01", 1000)]);
    expect(result.deltaPercent).toBe(-50);
  });

  it("gives no delta when the previous period had no sales", () => {
    // Every change from zero is infinite; the tile says so in words instead.
    expect(kpis(current, []).deltaPercent).toBeNull();
  });

  it("handles an empty range without dividing by zero", () => {
    const result = kpis([], []);
    expect(result).toMatchObject({
      totalSales: 0,
      orderCount: 0,
      averageOrder: 0,
      topBuyer: null,
      deltaPercent: null,
    });
  });
});
