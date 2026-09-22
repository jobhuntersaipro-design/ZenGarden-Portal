import { describe, expect, it } from "vitest";
import {
  attribution,
  filterCaption,
  filterOrders,
  isFiltered,
  lineMatches,
  resolveFilter,
} from "@/lib/analytics/line-filter";
import { NO_MARKET } from "@/lib/product-markets";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

const line = (
  amount: number,
  over: Partial<AnalyticsLineItem> = {},
): AnalyticsLineItem => ({
  productId: "p1",
  productName: "Product",
  market: "Vietnam",
  brand: "Zen Garden",
  category: "Shower cream & gel",
  quantity: 1,
  amount,
  ...over,
});

const order = (id: string, lineItems: AnalyticsLineItem[], total?: number): AnalyticsOrder => ({
  id,
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date("2026-09-01T04:00:00Z"),
  deliveryDate: null,
  // Deliberately not the sum of its lines: a real purchase order carries tax,
  // and one confirmed with an acknowledged mismatch carries neither.
  total: total ?? lineItems.reduce((sum, l) => sum + l.amount, 0),
  stage: "ORDER_PLACED",
  lineItems,
  stageEvents: [],
});

describe("what a line matches", () => {
  it("matches on each of the three columns, and on all of them at once", () => {
    const l = line(10);
    expect(lineMatches(l, { market: "Vietnam" })).toBe(true);
    expect(lineMatches(l, { market: "Mydin" })).toBe(false);
    expect(lineMatches(l, { brand: "Zen Garden" })).toBe(true);
    expect(lineMatches(l, { brand: "MR. KING" })).toBe(false);
    expect(lineMatches(l, { category: "Shower cream & gel" })).toBe(true);
    // Composition is an AND, so one wrong half fails the pair.
    expect(lineMatches(l, { market: "Vietnam", brand: "MR. KING" })).toBe(false);
    expect(lineMatches(l, { market: "Vietnam", brand: "Zen Garden" })).toBe(true);
  });

  it("matches nothing at all where the line found no product", () => {
    const orphan = line(10, {
      productId: null,
      productName: null,
      market: null,
      brand: null,
      category: null,
    });
    for (const filter of [
      { market: "Vietnam" },
      { brand: "Zen Garden" },
      { category: "Shower cream & gel" },
    ]) {
      expect(lineMatches(orphan, filter)).toBe(false);
    }
  });

  it("tells a product with no market apart from a line with no product", () => {
    // `NO_MARKET` asks for real products somebody has to give a market to.
    const unplaced = line(10, { market: null });
    const orphan = line(10, { productId: null, market: null });
    expect(lineMatches(unplaced, { market: NO_MARKET })).toBe(true);
    expect(lineMatches(orphan, { market: NO_MARKET })).toBe(false);
    // And a product that has one is not in the remainder.
    expect(lineMatches(line(10), { market: NO_MARKET })).toBe(false);
  });
});

describe("narrowing the orders to their matching lines", () => {
  it("is exactly the same array when nothing is being narrowed", () => {
    const orders = [order("po-1", [line(10)])];
    expect(filterOrders(orders, {})).toBe(orders);
    expect(isFiltered({})).toBe(false);
  });

  it("keeps the stated order total unfiltered, and the lines' sum filtered", () => {
    // 100 of lines under a 106 total — the six is tax.
    const orders = [order("po-1", [line(60), line(40, { market: "Mydin" })], 106)];
    expect(filterOrders(orders, {})[0].total).toBe(106);
    expect(filterOrders(orders, { market: "Vietnam" })[0].total).toBe(60);
    expect(filterOrders(orders, { market: "Mydin" })[0].total).toBe(40);
  });

  it("drops an order with no matching line rather than keeping it at zero", () => {
    // A zero-value order would sit in the order count and drag the average
    // down — it is not an order in this market at all.
    const orders = [
      order("keeps", [line(10, { market: "Mydin" })]),
      order("drops", [line(10, { market: "Vietnam" })]),
    ];
    const narrowed = filterOrders(orders, { market: "Mydin" });
    expect(narrowed.map((o) => o.id)).toEqual(["keeps"]);
  });

  it("never lets the markets sum to more than the lines they came from", () => {
    // The whole reason this narrows lines rather than orders. One order
    // spanning two markets contributes 60 to one and 40 to the other, never
    // 100 to both.
    const orders = [order("po-1", [line(60), line(40, { market: "Mydin" })], 100)];
    const vietnam = filterOrders(orders, { market: "Vietnam" });
    const mydin = filterOrders(orders, { market: "Mydin" });
    const summed =
      vietnam.reduce((s, o) => s + o.total, 0) + mydin.reduce((s, o) => s + o.total, 0);
    expect(summed).toBe(100);
  });
});

describe("what the market figures cannot account for", () => {
  it("splits line value into market, no market and no product", () => {
    const orders = [
      order("po-1", [
        line(100),
        line(50, { market: "Mydin" }),
        line(30, { market: null }),
        line(20, { productId: null, productName: null, market: null, brand: null, category: null }),
      ]),
    ];
    const a = attribution(orders);
    expect(a.lineTotal).toBe(200);
    expect(a.inMarket).toBe(150);
    expect(a.noMarket).toBe(30);
    expect(a.noProduct).toBe(20);
    expect(a.unattributed).toBe(50);
    expect(a.marketCount).toBe(2);
    // The invariant the card is drawn from.
    expect(a.inMarket + a.unattributed).toBe(a.lineTotal);
  });

  it("rounds to cents, so two sums of the same figures print alike", () => {
    const orders = [order("po-1", [line(0.1), line(0.2)])];
    expect(attribution(orders).lineTotal).toBe(0.3);
  });
});

describe("the caption the summary line carries", () => {
  it("is absent with no filter, and names each part with the others", () => {
    expect(filterCaption({})).toBeNull();
    expect(filterCaption({ market: "Mydin" })).toContain("Mydin");
    expect(filterCaption({ market: NO_MARKET })).toContain("products with no market");
    const both = filterCaption({ market: "Mydin", brand: "Zen Garden" })!;
    expect(both).toContain("Mydin");
    expect(both).toContain("Zen Garden");
    // It says what it is doing to the figures, not just what is chosen.
    expect(both).toContain("only these lines");
  });
});

describe("resolving a filter against what the range actually holds", () => {
  const available = {
    markets: ["Mydin", "Vietnam"],
    brands: ["Zen Garden"],
    categories: ["Shower cream & gel"],
    hasNoMarket: true,
  };

  it("keeps a value the range carries", () => {
    expect(resolveFilter({ market: "Mydin" }, available)).toEqual({ market: "Mydin" });
    expect(resolveFilter({ brand: "Zen Garden" }, available)).toEqual({
      brand: "Zen Garden",
    });
  });

  it("drops a value nothing in range carries, rather than drawing an empty board", () => {
    // Honouring it would leave the select showing a filter the figures are
    // not applying — a filter the reader can neither see working nor undo.
    expect(resolveFilter({ market: "Atlantis" }, available)).toEqual({});
    expect(resolveFilter({ brand: "Nobody" }, available)).toEqual({});
    expect(resolveFilter({ category: "Nothing" }, available)).toEqual({});
  });

  it("drops the parts it cannot honour and keeps the parts it can", () => {
    expect(resolveFilter({ market: "Mydin", brand: "Nobody" }, available)).toEqual({
      market: "Mydin",
    });
  });

  it("keeps NO_MARKET only while some product really carries none", () => {
    expect(resolveFilter({ market: NO_MARKET }, available)).toEqual({
      market: NO_MARKET,
    });
    expect(resolveFilter({ market: NO_MARKET }, { ...available, hasNoMarket: false })).toEqual(
      {},
    );
  });
});
