import { describe, expect, it } from "vitest";
import {
  currentCounts,
  deliveryDeductions,
  deliveryReturns,
  describeStockCount,
  stockShortfall,
  latestCount,
  stockActivity,
  stockTrend,
  type StockCountRow,
} from "@/lib/stock";

const row = (over: Partial<StockCountRow> & { id: string }): StockCountRow => ({
  countedOn: "2026-09-10",
  cartons: 10,
  note: null,
  countedByName: "Aisha Rahman",
  createdAt: "2026-09-10T02:00:00.000Z",
  supersedesId: null,
  supersededById: null,
  ...over,
});

describe("a correction never destroys what it corrects", () => {
  const first = row({ id: "a", countedOn: "2026-09-12", cartons: 40, supersededById: "b" });
  const fix = row({
    id: "b",
    countedOn: "2026-09-12",
    cartons: 46,
    supersedesId: "a",
    createdAt: "2026-09-20T02:00:00.000Z",
  });

  it("keeps both rows and counts only the one that stands", () => {
    const rows = [first, fix];
    expect(rows).toHaveLength(2);
    expect(currentCounts(rows).map((r) => r.id)).toEqual(["b"]);
  });

  it("names the change in the feed, newest work first", () => {
    const feed = stockActivity([first, fix]);
    expect(feed[0].id).toBe("b");
    expect(describeStockCount(feed[0])).toBe("corrected 40 to 46 cartons");
    expect(feed[1].superseded).toBe(true);
    expect(describeStockCount(feed[1])).toBe("counted 40 cartons");
  });
});

describe("latestCount — what Product.stockCartons caches", () => {
  it("is the current row with the latest day counted", () => {
    const rows = [
      row({ id: "a", countedOn: "2026-09-01", cartons: 5 }),
      row({ id: "b", countedOn: "2026-09-20", cartons: 80 }),
      row({ id: "c", countedOn: "2026-09-10", cartons: 30 }),
    ];
    expect(latestCount(rows)?.cartons).toBe(80);
  });

  /**
   * The case the spec's criterion 4 turns on: correcting a *past* day must not
   * move the current figure, however recently the correction was typed.
   */
  it("does not move when an older day is corrected today", () => {
    const rows = [
      row({ id: "old", countedOn: "2026-09-01", cartons: 5, supersededById: "fix" }),
      row({ id: "now", countedOn: "2026-09-20", cartons: 80 }),
      row({
        id: "fix",
        countedOn: "2026-09-01",
        cartons: 9,
        supersedesId: "old",
        createdAt: "2026-09-22T02:00:00.000Z",
      }),
    ];
    expect(latestCount(rows)?.cartons).toBe(80);
  });

  it("is nothing when nothing has been counted", () => {
    expect(latestCount([])).toBeNull();
  });
});

describe("stockTrend", () => {
  it("draws the counts that stand, oldest first, and no others", () => {
    const rows = [
      row({ id: "b", countedOn: "2026-09-20", cartons: 80 }),
      row({ id: "a", countedOn: "2026-09-01", cartons: 5, supersededById: "fix" }),
      row({ id: "fix", countedOn: "2026-09-01", cartons: 9, supersedesId: "a" }),
    ];
    expect(stockTrend(rows)).toEqual([
      { date: "2026-09-01", cartons: 9 },
      { date: "2026-09-20", cartons: 80 },
    ]);
  });

  /** A stocktake measures a day. It cannot say what happened between two. */
  it("does not invent a point for a day nobody counted", () => {
    const rows = [
      row({ id: "a", countedOn: "2026-09-01" }),
      row({ id: "b", countedOn: "2026-09-30" }),
    ];
    expect(stockTrend(rows)).toHaveLength(2);
  });
});

describe("stock moved by delivery", () => {
  const stock = new Map<string, number | null>([
    ["a", 50],
    ["b", 5],
    ["c", null],
  ]);

  it("takes each product's cartons off, summed across lines, below zero when short", () => {
    expect(
      deliveryDeductions(
        [
          { productId: "a", quantity: 6 },
          { productId: "a", quantity: 4 },
          { productId: "b", quantity: 8 },
          { productId: "c", quantity: 3 },
          { productId: null, quantity: 9 },
        ],
        stock,
      ),
    ).toEqual([
      { productId: "a", from: 50, to: 40 },
      { productId: "b", from: 5, to: -3 },
    ]);
  });

  it("counts as short only the cartons the count did not cover", () => {
    expect(stockShortfall({ productId: "a", from: 50, to: 40 })).toBe(0);
    expect(stockShortfall({ productId: "a", from: 30, to: -14 })).toBe(14);
    // Already below zero: the whole move is short, and no more than it.
    expect(stockShortfall({ productId: "a", from: -5, to: -15 })).toBe(10);
    // Putting cartons back is never short.
    expect(stockShortfall({ productId: "a", from: -14, to: 30 })).toBe(0);
  });

  it("puts back what the order still has out, not what it asked for", () => {
    const out = [
      { productId: "a", from: 50, to: 40 },
      { productId: "b", from: 5, to: -3 },
    ];
    const now = new Map<string, number | null>([["a", 38], ["b", -3]]);
    expect(deliveryReturns(out, now)).toEqual([
      { productId: "a", from: 38, to: 48 },
      { productId: "b", from: -3, to: 5 },
    ]);
    // Out, back, out again: only the last trip is still out.
    const cycled = [...out, { productId: "a", from: 40, to: 50 }, { productId: "b", from: -3, to: 5 }];
    expect(deliveryReturns(cycled, now)).toEqual([]);
  });

  it("describes a move as from what to what", () => {
    const feed = stockActivity([row({ id: "m", cartons: 40, fromCartons: 50 })]);
    expect(describeStockCount(feed[0])).toBe("moved 50 to 40 cartons");
  });
});
