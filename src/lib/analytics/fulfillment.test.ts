import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  openPipeline,
  stageBreakdown,
  stageSeries,
} from "@/lib/analytics/fulfillment";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const order = (
  poDate: string,
  stage: PoStage,
  total = 100,
  events: { toStage: PoStage; changedAt: string }[] = [],
): AnalyticsOrder => ({
  id: `${poDate}-${stage}`,
  poNumber: "PO-1",
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date(`${poDate}T04:00:00Z`),
  total,
  stage,
  lineItems: [],
  stageEvents: events.map((event) => ({
    toStage: event.toStage,
    changedAt: new Date(event.changedAt),
  })),
});

const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-09-03T15:00:00Z");

describe("stageSeries", () => {
  it("counts each bucket's orders by the stage they are in today", () => {
    const points = stageSeries(
      [
        order("2026-09-01", PoStage.IN_PRODUCTION),
        order("2026-09-01", PoStage.DELIVERED),
        order("2026-09-03", PoStage.DELIVERED),
      ],
      FROM,
      TO,
      "day",
    );
    expect(points).toHaveLength(3);
    expect(points[0].IN_PRODUCTION).toBe(1);
    expect(points[0].DELIVERED).toBe(1);
    expect(points[0].total).toBe(2);
    expect(points[1].total).toBe(0);
  });

  it("segments sum to the bucket total", () => {
    const points = stageSeries(
      [
        order("2026-09-02", PoStage.ORDER_PLACED),
        order("2026-09-02", PoStage.QC_PASSED),
        order("2026-09-02", PoStage.DELIVERED),
      ],
      FROM,
      TO,
      "day",
    );
    const bucket = points[1];
    const summed = [
      bucket.ORDER_PLACED,
      bucket.IN_PRODUCTION,
      bucket.QC_PASSED,
      bucket.IN_WAREHOUSE,
      bucket.DELIVERING,
      bucket.DELIVERED,
    ].reduce((a, b) => a + b, 0);
    expect(summed).toBe(bucket.total);
    expect(summed).toBe(3);
  });

  it("keeps empty buckets as empty columns", () => {
    const points = stageSeries([], FROM, TO, "day");
    expect(points).toHaveLength(3);
    expect(points.every((point) => point.total === 0)).toBe(true);
  });
});

describe("stageBreakdown", () => {
  it("lists all six stages in order, even the empty ones", () => {
    const breakdown = stageBreakdown([order("2026-09-01", PoStage.DELIVERED)]);
    expect(breakdown.map((entry) => entry.stage)).toEqual([
      "ORDER_PLACED",
      "IN_PRODUCTION",
      "QC_PASSED",
      "IN_WAREHOUSE",
      "DELIVERING",
      "DELIVERED",
    ]);
    expect(breakdown.find((e) => e.stage === "DELIVERED")?.count).toBe(1);
    expect(breakdown.find((e) => e.stage === "QC_PASSED")?.count).toBe(0);
  });
});

describe("openPipeline", () => {
  it("counts and values everything that is not Delivered", () => {
    const result = openPipeline([
      order("2026-09-01", PoStage.IN_PRODUCTION, 500),
      order("2026-09-01", PoStage.DELIVERING, 300),
      order("2026-09-01", PoStage.DELIVERED, 900),
    ]);
    expect(result.openCount).toBe(2);
    expect(result.openValue).toBe(800);
  });

  it("averages order-placed to delivered over orders that got there", () => {
    const result = openPipeline([
      order("2026-09-01", PoStage.DELIVERED, 100, [
        { toStage: PoStage.ORDER_PLACED, changedAt: "2026-09-01T00:00:00Z" },
        { toStage: PoStage.DELIVERED, changedAt: "2026-09-11T00:00:00Z" },
      ]),
      order("2026-09-01", PoStage.DELIVERED, 100, [
        { toStage: PoStage.ORDER_PLACED, changedAt: "2026-09-01T00:00:00Z" },
        { toStage: PoStage.DELIVERED, changedAt: "2026-09-21T00:00:00Z" },
      ]),
    ]);
    expect(result.averageDaysToDeliver).toBe(15);
  });

  it("ignores orders still in flight rather than counting them as zero days", () => {
    // Including them would drag the average toward zero and flatter the number.
    const result = openPipeline([
      order("2026-09-01", PoStage.DELIVERED, 100, [
        { toStage: PoStage.ORDER_PLACED, changedAt: "2026-09-01T00:00:00Z" },
        { toStage: PoStage.DELIVERED, changedAt: "2026-09-11T00:00:00Z" },
      ]),
      order("2026-09-01", PoStage.IN_PRODUCTION, 100, [
        { toStage: PoStage.ORDER_PLACED, changedAt: "2026-09-01T00:00:00Z" },
      ]),
    ]);
    expect(result.averageDaysToDeliver).toBe(10);
  });

  it("has no average when nothing has been delivered", () => {
    const result = openPipeline([order("2026-09-01", PoStage.IN_PRODUCTION)]);
    expect(result.averageDaysToDeliver).toBeNull();
  });
});
