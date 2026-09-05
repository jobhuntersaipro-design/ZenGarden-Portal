import { describe, expect, it } from "vitest";
import {
  boughtTogether,
  needsAttention,
  priceTrend,
  productStats,
  twelveMonthWindow,
  whoBuysIt,
  type ProductSaleRow,
} from "@/lib/analytics/products";

const NOW = new Date("2026-09-17T04:00:00Z");
const WINDOW = twelveMonthWindow(NOW);

// `Partial<ProductSaleRow> & { poDate: string }` intersects poDate to
// `Date & string`, which nothing satisfies. Omit it before overriding.
const row = (
  over: Omit<Partial<ProductSaleRow>, "poDate"> & { poDate: string },
): ProductSaleRow => ({
  purchaseOrderId: over.purchaseOrderId ?? `po-${over.poDate}`,
  poNumber: "PO-1",
  poDate: new Date(`${over.poDate}T04:00:00Z`),
  buyerId: over.buyerId ?? "b1",
  buyerName: over.buyerName ?? "Acme",
  productId: over.productId ?? "p1",
  quantity: over.quantity ?? 1,
  amount: over.amount ?? 100,
});

describe("twelveMonthWindow", () => {
  it("is exactly twelve months back in Kuala Lumpur, both ends inclusive", () => {
    const day = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(d);
    expect(day(WINDOW.from)).toBe("2025-09-17");
    expect(day(WINDOW.to)).toBe("2026-09-17");
  });

  it("is one definition, so two callers cannot drift apart", () => {
    // The bug this guards: an order-history table on 367 days beside tiles on
    // 365, disagreeing by a couple of orders.
    const a = twelveMonthWindow(NOW);
    const b = twelveMonthWindow(NOW);
    expect(a.from.getTime()).toBe(b.from.getTime());
    expect(a.to.getTime()).toBe(b.to.getTime());
  });
});

describe("productStats", () => {
  const rows = [
    row({ poDate: "2026-08-01", quantity: 10, amount: 900, purchaseOrderId: "po-a" }),
    row({ poDate: "2026-09-01", quantity: 5, amount: 500, purchaseOrderId: "po-b", buyerId: "b2", buyerName: "Bluewave" }),
  ];

  it("totals revenue, units, orders and buyers", () => {
    const stats = productStats(rows, 100, 50, WINDOW, NOW);
    expect(stats.revenue).toBe(1400);
    expect(stats.units).toBe(15);
    expect(stats.orders).toBe(2);
    expect(stats.buyers).toBe(2);
  });

  it("bills at amount over quantity, so a discount shows", () => {
    const stats = productStats(rows, 100, 50, WINDOW, NOW);
    // 1400 over 15 units.
    expect(stats.avgBilled).toBeCloseTo(93.33, 2);
  });

  it("computes vs-list from the very average it sits beside", () => {
    const stats = productStats(rows, 100, 50, WINDOW, NOW);
    expect(stats.vsListPercent).toBeCloseTo(-6.67, 2);
    // Recomputing from the printed figure must give the printed percentage.
    expect(((stats.avgBilled - 100) / 100) * 100).toBeCloseTo(stats.vsListPercent, 6);
  });

  it("drifts from the first month with sales to the last", () => {
    // Aug billed 90, Sep billed 100.
    const stats = productStats(rows, 100, 50, WINDOW, NOW);
    expect(stats.driftPercent).toBeCloseTo(11.11, 2);
  });

  it("has no drift from a single month — that is a price, not a movement", () => {
    const stats = productStats([rows[0]], 100, 50, WINDOW, NOW);
    expect(stats.driftPercent).toBeNull();
  });

  it("measures velocity over the last eight weeks only", () => {
    const recent = [
      row({ poDate: "2026-09-10", quantity: 40 }),
      row({ poDate: "2026-01-01", quantity: 999 }),
    ];
    expect(productStats(recent, 100, 50, WINDOW, NOW).velocity).toBe(5);
  });

  it("computes attach rate against every order in the window", () => {
    const stats = productStats(rows, 100, 8, WINDOW, NOW);
    expect(stats.attachRate).toBe(25);
  });

  it("handles a product that never sold without dividing by zero", () => {
    const stats = productStats([], 100, 50, WINDOW, NOW);
    expect(stats).toMatchObject({
      revenue: 0,
      units: 0,
      orders: 0,
      avgBilled: 0,
      driftPercent: null,
      velocity: 0,
      firstSold: null,
      lastSold: null,
    });
  });
});

describe("priceTrend", () => {
  it("leaves a gap for a month with no sales rather than a zero", () => {
    // A zero would draw the price collapsing to nothing, which never happened.
    const points = priceTrend(
      [row({ poDate: "2026-09-01", quantity: 2, amount: 200 })],
      WINDOW,
    );
    const september = points.find((point) => point.key === "2026-09-01");
    expect(september?.avgBilled).toBe(100);
    const august = points.find((point) => point.key === "2026-08-01");
    expect(august?.avgBilled).toBeNull();
    expect(august?.units).toBe(0);
  });

  it("gives one point per month across the window", () => {
    expect(priceTrend([], WINDOW)).toHaveLength(13);
  });
});

describe("whoBuysIt", () => {
  it("ranks buyers by value", () => {
    const slices = whoBuysIt([
      row({ poDate: "2026-09-01", amount: 100, buyerId: "b1", buyerName: "Acme" }),
      row({ poDate: "2026-09-02", amount: 300, buyerId: "b2", buyerName: "Bluewave" }),
    ]);
    expect(slices[0].label).toBe("Bluewave");
    expect(slices[0].share).toBe(75);
  });
});

describe("boughtTogether", () => {
  it("measures co-occurrence against this product's own orders", () => {
    const mine = [
      row({ poDate: "2026-09-01", purchaseOrderId: "po-a" }),
      row({ poDate: "2026-09-02", purchaseOrderId: "po-b" }),
    ];
    const all = [
      ...mine,
      row({ poDate: "2026-09-01", purchaseOrderId: "po-a", productId: "p2" }),
      row({ poDate: "2026-09-02", purchaseOrderId: "po-b", productId: "p2" }),
      row({ poDate: "2026-09-02", purchaseOrderId: "po-b", productId: "p3" }),
      // A different order that never contained p1.
      row({ poDate: "2026-09-03", purchaseOrderId: "po-c", productId: "p2" }),
    ];
    const result = boughtTogether(
      mine,
      all,
      new Map([
        ["p2", "Granite step"],
        ["p3", "Stone lantern"],
      ]),
    );
    expect(result[0]).toMatchObject({ productName: "Granite step", orders: 2, coOccurrence: 100 });
    expect(result[1]).toMatchObject({ productName: "Stone lantern", orders: 1, coOccurrence: 50 });
  });

  it("returns nothing when the product never sold", () => {
    expect(boughtTogether([], [], new Map())).toEqual([]);
  });
});

describe("needsAttention", () => {
  // `??` would swallow an explicit null and hand back the default date, which
  // is exactly the case "never sold" needs to express.
  const stats = (over: Partial<{ lastSold: Date | null; driftPercent: number | null }>) => ({
    lastSold: "lastSold" in over ? over.lastSold! : new Date("2026-09-10T04:00:00Z"),
    driftPercent: "driftPercent" in over ? over.driftPercent! : 0,
  });

  it("flags a product with no images", () => {
    const flags = needsAttention(
      [{ id: "p1", active: true, imageCount: 0 }],
      new Map([["p1", stats({})]]),
      NOW,
    );
    expect(flags[0].flags).toContain("missing-image");
  });

  it("flags an inactive product", () => {
    const flags = needsAttention(
      [{ id: "p1", active: false, imageCount: 2 }],
      new Map([["p1", stats({})]]),
      NOW,
    );
    expect(flags[0].flags).toContain("inactive");
  });

  it("flags a product not sold in sixty days, and one never sold at all", () => {
    const stale = needsAttention(
      [{ id: "p1", active: true, imageCount: 1 }],
      new Map([["p1", stats({ lastSold: new Date("2026-06-01T04:00:00Z") })]]),
      NOW,
    );
    expect(stale[0].flags).toContain("not-sold-60d");

    const never = needsAttention(
      [{ id: "p2", active: true, imageCount: 1 }],
      new Map([["p2", stats({ lastSold: null })]]),
      NOW,
    );
    expect(never[0].flags).toContain("not-sold-60d");
  });

  it("flags a price that moved more than three percent, either way", () => {
    const up = needsAttention(
      [{ id: "p1", active: true, imageCount: 1 }],
      new Map([["p1", stats({ driftPercent: 4 })]]),
      NOW,
    );
    const down = needsAttention(
      [{ id: "p1", active: true, imageCount: 1 }],
      new Map([["p1", stats({ driftPercent: -4 })]]),
      NOW,
    );
    expect(up[0].flags).toContain("price-moved");
    expect(down[0].flags).toContain("price-moved");
  });

  it("leaves a healthy product unflagged", () => {
    const flags = needsAttention(
      [{ id: "p1", active: true, imageCount: 3 }],
      new Map([["p1", stats({ driftPercent: 1 })]]),
      NOW,
    );
    expect(flags[0].flags).toEqual([]);
  });
});
