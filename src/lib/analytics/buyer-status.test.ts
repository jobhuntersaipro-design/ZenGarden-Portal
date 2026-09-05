import { describe, expect, it } from "vitest";
import { buyerStatus } from "@/lib/analytics/buyer-status";
import type { AnalyticsOrder } from "@/lib/analytics/types";

const NOW = new Date("2026-09-17T04:00:00Z");
const RANGE = {
  from: new Date("2026-06-19T00:00:00Z"),
  to: new Date("2026-09-17T23:59:59Z"),
};
/** Well over a quarter of the range before it starts. */
const OLD_RECORD = new Date("2024-01-01T00:00:00Z");

const order = (poDate: string): AnalyticsOrder => ({
  id: `po-${poDate}`,
  poNumber: "PO-1",
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date(`${poDate}T04:00:00Z`),
  total: 100,
  stage: "ORDER_PLACED",
  lineItems: [],
  stageEvents: [],
});

/** Orders every `everyDays` from `start` up to and including `end`. */
const cadence = (start: string, end: string, everyDays: number) => {
  const orders: AnalyticsOrder[] = [];
  const last = new Date(`${end}T04:00:00Z`).getTime();
  for (
    let time = new Date(`${start}T04:00:00Z`).getTime();
    time <= last;
    time += everyDays * 24 * 60 * 60 * 1000
  ) {
    orders.push(order(new Date(time).toISOString().slice(0, 10)));
  }
  return orders;
};

const status = (over: Partial<Parameters<typeof buyerStatus>[0]>) =>
  buyerStatus({
    current: [],
    previous: [],
    history: [],
    range: RANGE,
    recordStart: OLD_RECORD,
    now: NOW,
    ...over,
  });

describe("buyerStatus", () => {
  it("is lapsed when they bought last period and nothing since", () => {
    const previous = [order("2026-05-01")];
    expect(status({ previous, history: previous }).klass).toBe("lapsed");
  });

  it("is at risk when silent past twice their own gap", () => {
    // Weekly cadence, last order 16 days ago.
    const history = [order("2026-08-18"), order("2026-08-25"), order("2026-09-01")];
    expect(status({ current: history, history }).klass).toBe("at-risk");
  });

  it("is not at risk for a quarterly buyer at the same silence", () => {
    const history = [order("2026-03-01"), order("2026-06-01"), order("2026-09-01")];
    expect(status({ current: history, history }).klass).toBe("active");
  });

  it("respects the fourteen-day floor", () => {
    // Every three days from before the range. The last one lands 9 days ago:
    // past twice their gap, but under the floor, so nobody is chased over a
    // week and a bit.
    const history = cadence("2026-06-01", "2026-09-09", 3);
    const result = status({ current: history, history });
    expect(result.cadenceDays).toBeCloseTo(3, 0);
    expect(result.daysSilent).toBe(9);
    expect(result.daysSilent!).toBeGreaterThan(result.cadenceDays! * 2);
    expect(result.klass).toBe("active");
  });

  it("is new when their first-ever order falls inside the range", () => {
    const history = [order("2026-07-01")];
    const result = status({ current: history, history });
    expect(result.klass).toBe("new");
    expect(result.newUnknowable).toBe(false);
  });

  it("suppresses new when the record barely predates the range", () => {
    // The record starts a week before a three-month range: "new" cannot be
    // told from "we have no earlier data", so the label is withheld.
    const history = [order("2026-07-01")];
    const result = status({
      current: history,
      history,
      recordStart: new Date("2026-06-12T00:00:00Z"),
    });
    expect(result.newUnknowable).toBe(true);
    expect(result.klass).toBe("active");
  });

  it("prefers lapsed over new when both could apply", () => {
    // First match wins, and having stopped matters more than having started.
    const previous = [order("2026-05-01")];
    expect(status({ previous, history: previous }).klass).toBe("lapsed");
  });

  it("is active for a steady buyer whose record predates the range", () => {
    const history = [
      order("2026-05-01"),
      order("2026-07-01"),
      order("2026-08-01"),
      order("2026-09-10"),
    ];
    expect(status({ current: history, history }).klass).toBe("active");
  });

  it("reports cadence, last order and days silent", () => {
    const history = [order("2026-08-18"), order("2026-09-01")];
    const result = status({ current: history, history });
    expect(result.cadenceDays).toBeCloseTo(14, 0);
    expect(result.daysSilent).toBe(16);
    expect(result.lastOrderAt?.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("handles a buyer with no orders at all", () => {
    const result = status({});
    expect(result.klass).toBe("active");
    expect(result.cadenceDays).toBeNull();
    expect(result.lastOrderAt).toBeNull();
  });
});
