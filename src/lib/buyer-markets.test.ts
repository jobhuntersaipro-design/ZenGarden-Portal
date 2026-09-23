import { describe, expect, it } from "vitest";
import {
  NO_MARKET,
  buyerMarketOptions,
  matchesMarket,
  resolveBuyerMarket,
} from "@/lib/buyer-markets";

const rows = [
  { market: "Vietnam" },
  { market: "Mydin" },
  { market: "Vietnam" },
  { market: null },
];

describe("matchesMarket", () => {
  it("matches every row when no market is chosen", () => {
    expect(rows.filter((row) => matchesMarket(row, null))).toHaveLength(4);
  });

  it("matches only that market", () => {
    expect(rows.filter((row) => matchesMarket(row, "Vietnam"))).toHaveLength(2);
    expect(rows.filter((row) => matchesMarket(row, "Mydin"))).toHaveLength(1);
  });

  it("matches the buyers carrying none, which is the whole worklist", () => {
    expect(rows.filter((row) => matchesMarket(row, NO_MARKET))).toEqual([
      { market: null },
    ]);
  });

  it("does not let a buyer with no market fall into a named market", () => {
    // The failure that would make the filter useless: "No market" and
    // "Vietnam" both returning the unassigned buyer.
    expect(matchesMarket({ market: null }, "Vietnam")).toBe(false);
    expect(matchesMarket({ market: "Vietnam" }, NO_MARKET)).toBe(false);
  });
});

describe("buyerMarketOptions", () => {
  it("offers each market once, sorted, and says whether any buyer has none", () => {
    expect(buyerMarketOptions(rows)).toEqual({
      markets: ["Mydin", "Vietnam"],
      hasNoMarket: true,
    });
  });

  it("does not offer No market when every buyer has one", () => {
    expect(buyerMarketOptions([{ market: "Mydin" }])).toEqual({
      markets: ["Mydin"],
      hasNoMarket: false,
    });
  });

  it("offers nothing for an empty roster", () => {
    expect(buyerMarketOptions([])).toEqual({ markets: [], hasNoMarket: false });
  });
});

describe("resolveBuyerMarket", () => {
  it("keeps a market some buyer is in", () => {
    expect(resolveBuyerMarket("Vietnam", rows)).toBe("Vietnam");
  });

  it("drops a market nothing in range carries, rather than drawing an empty board", () => {
    expect(resolveBuyerMarket("Atlantis", rows)).toBeNull();
  });

  it("keeps No market only while some buyer has none", () => {
    expect(resolveBuyerMarket(NO_MARKET, rows)).toBe(NO_MARKET);
    expect(resolveBuyerMarket(NO_MARKET, [{ market: "Mydin" }])).toBeNull();
  });

  it("reads an absent parameter as All markets", () => {
    expect(resolveBuyerMarket(undefined, rows)).toBeNull();
    expect(resolveBuyerMarket("", rows)).toBeNull();
  });
});
