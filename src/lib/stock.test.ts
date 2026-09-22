import { describe, expect, it } from "vitest";
import {
  currentCounts,
  describeStockCount,
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
