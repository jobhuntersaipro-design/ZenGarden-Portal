import { describe, expect, it } from "vitest";
import { marketMix } from "@/lib/analytics/market-mix";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

const line = (market: string | null, amount: number): AnalyticsLineItem => ({
  productId: "p1",
  productName: "Product",
  market,
  brand: "Zen Garden",
  category: "Shower cream & gel",
  quantity: 1,
  amount,
});

const order = (lines: [string | null, number][]): AnalyticsOrder => ({
  id: `po-${Math.random()}`,
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date("2026-09-01T04:00:00Z"),
  deliveryDate: null,
  total: lines.reduce((sum, [, amount]) => sum + amount, 0),
  stage: "ORDER_PLACED",
  lineItems: lines.map(([market, amount]) => line(market, amount)),
  stageEvents: [],
});

const row = (mix: ReturnType<typeof marketMix>, market: string) =>
  mix.rows.find((r) => r.market === market)!;

describe("each market's share, now against last period", () => {
  it("takes share of attributed value, not of total sales", () => {
    // The 40 on a product with no market has no market to take share from,
    // so it is out of the denominator rather than diluting everyone.
    const mix = marketMix([order([["Vietnam", 60], [null, 40]])], []);
    expect(mix.total).toBe(60);
    expect(row(mix, "Vietnam").share).toBe(100);
  });

  it("reports the change in share in percentage points", () => {
    const mix = marketMix(
      [order([["Vietnam", 75], ["Mydin", 25]])],
      [order([["Vietnam", 50], ["Mydin", 50]])],
    );
    expect(row(mix, "Vietnam").share).toBe(75);
    expect(row(mix, "Vietnam").priorShare).toBe(50);
    expect(row(mix, "Vietnam").deltaShare).toBe(25);
    expect(row(mix, "Mydin").deltaShare).toBe(-25);
  });

  it("gives a market that is new no delta, rather than a growth figure from nothing", () => {
    // "+40pp" against a base that never existed reads as growth. It is not.
    const mix = marketMix(
      [order([["Vietnam", 60], ["Mydin", 40]])],
      [order([["Vietnam", 50]])],
    );
    expect(row(mix, "Mydin").isNew).toBe(true);
    expect(row(mix, "Mydin").deltaShare).toBeNull();
    expect(row(mix, "Vietnam").isNew).toBe(false);
  });

  it("keeps a market that has gone quiet, at zero — its absence is the finding", () => {
    const mix = marketMix([order([["Vietnam", 100]])], [order([["Mydin", 80]])]);
    const gone = row(mix, "Mydin");
    expect(gone.value).toBe(0);
    expect(gone.priorValue).toBe(80);
    expect(gone.isGone).toBe(true);
  });

  it("ranks by this period's value, so the biggest market leads", () => {
    const mix = marketMix(
      [order([["Vietnam", 10], ["Mydin", 90], ["Super Indo", 50]])],
      [],
    );
    expect(mix.rows.map((r) => r.market)).toEqual(["Mydin", "Super Indo", "Vietnam"]);
  });

  it("is empty where no line in either period carries a market", () => {
    const mix = marketMix([order([[null, 100]])], [order([[null, 80]])]);
    expect(mix.rows).toEqual([]);
    expect(mix.total).toBe(0);
  });
});
