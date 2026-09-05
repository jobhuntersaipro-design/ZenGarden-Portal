import { describe, expect, it } from "vitest";
import { buyerChurn } from "@/lib/analytics/churn";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const NOW = new Date("2026-09-17T04:00:00Z");

const order = (
  buyerId: string,
  poDate: string,
  total = 100,
): AnalyticsOrder => ({
  id: `${buyerId}-${poDate}`,
  poNumber: "PO-1",
  buyerId,
  buyerName: buyerId.toUpperCase(),
  poDate: new Date(`${poDate}T04:00:00Z`),
  total,
  stage: "ORDER_PLACED",
  lineItems: [],
  stageEvents: [],
});

describe("buyerChurn — lapsed", () => {
  it("flags a buyer who ordered last period and not this one", () => {
    const previous = [order("acme", "2026-08-01", 500)];
    const result = buyerChurn([], previous, previous, NOW);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      buyerId: "acme",
      klass: "lapsed",
      previousValue: 500,
    });
  });

  it("computes churn rate as lapsed over buyers active last period", () => {
    const previous = [
      order("acme", "2026-08-01"),
      order("bluewave", "2026-08-02"),
      order("cedar", "2026-08-03"),
    ];
    const current = [order("acme", "2026-09-01")];
    const result = buyerChurn(current, previous, [...previous, ...current], NOW);
    expect(result.activeLastPeriod).toBe(3);
    expect(result.lapsedCount).toBe(2);
    expect(result.churnRate).toBeCloseTo(66.67, 1);
  });

  it("is not lapsed if they ordered again this period", () => {
    const previous = [order("acme", "2026-08-01")];
    const current = [order("acme", "2026-09-15")];
    const result = buyerChurn(current, previous, [...previous, ...current], NOW);
    expect(result.lapsedCount).toBe(0);
  });

  it("has a churn rate of zero, not NaN, when nobody was active", () => {
    expect(buyerChurn([], [], [], NOW).churnRate).toBe(0);
  });
});

describe("buyerChurn — at risk", () => {
  it("flags a weekly buyer silent for over two weeks", () => {
    // Gaps of exactly 7 days, so cadence is 7; last order 16 days before NOW.
    // Past 2× cadence and past the 14-day floor.
    const history = [
      order("acme", "2026-08-18"),
      order("acme", "2026-08-25"),
      order("acme", "2026-09-01"),
    ];
    const result = buyerChurn(history, [], history, NOW);
    expect(result.rows[0]).toMatchObject({ buyerId: "acme", klass: "at-risk" });
    expect(result.atRiskCount).toBe(1);
  });

  it("does not flag a quarterly buyer at the same silence", () => {
    // Cadence ~90 days, silent 20: nowhere near 2× cadence. A fixed threshold
    // would have flagged this buyer, which is the point of being cadence-aware.
    const history = [
      order("cedar", "2026-03-01"),
      order("cedar", "2026-06-01"),
      order("cedar", "2026-08-28"),
    ];
    const result = buyerChurn(history, [], history, NOW);
    expect(result.atRiskCount).toBe(0);
  });

  it("respects the 14-day floor for a very frequent buyer", () => {
    // Cadence 2 days, silent 6: past 2× cadence but under the floor.
    const history = [
      order("daily", "2026-09-07"),
      order("daily", "2026-09-09"),
      order("daily", "2026-09-11"),
    ];
    const result = buyerChurn(history, [], history, NOW);
    expect(result.atRiskCount).toBe(0);
  });

  it("never flags a first-time buyer, who has no cadence", () => {
    const history = [order("newbie", "2026-06-01")];
    const result = buyerChurn(history, [], history, NOW);
    expect(result.atRiskCount).toBe(0);
  });

  it("excludes churned buyers so dead accounts do not crowd the list", () => {
    // Cadence 30 days, silent 108: over 90 days and past 3× cadence.
    const history = [
      order("gone", "2026-04-01"),
      order("gone", "2026-05-01"),
      order("gone", "2026-06-01"),
    ];
    const result = buyerChurn(history, [], history, NOW);
    expect(result.atRiskCount).toBe(0);
    expect(result.rows).toHaveLength(0);
  });
});

describe("buyerChurn — ordering", () => {
  it("puts lapsed above at risk, then sorts by value at stake", () => {
    const previous = [order("big", "2026-08-01", 900), order("small", "2026-08-01", 100)];
    const atRisk = [
      order("weekly", "2026-08-18"),
      order("weekly", "2026-08-25"),
      order("weekly", "2026-09-01"),
    ];
    const result = buyerChurn(atRisk, previous, [...previous, ...atRisk], NOW);
    expect(result.rows.map((row) => row.buyerId)).toEqual(["big", "small", "weekly"]);
  });

  it("caps the list at six rows", () => {
    const previous = Array.from({ length: 9 }, (_, index) =>
      order(`b${index}`, "2026-08-01", index),
    );
    const result = buyerChurn([], previous, previous, NOW);
    expect(result.rows).toHaveLength(6);
    expect(result.lapsedCount).toBe(9);
  });
});
