import { describe, expect, it, vi } from "vitest";
import { PoStage } from "@/generated/prisma/enums";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { purchaseOrder: { findMany } },
}));

const { loadPoStageBoard } = await import("@/lib/queries/po-stages");

/** The window this board is read over throughout: 15–17 Sep 2026, in KL. */
const FROM = new Date("2026-09-15T00:00:00+08:00");
const TO = new Date("2026-09-17T12:00:00+08:00");

type Line = {
  productId: string | null;
  sku?: string;
  name?: string;
  variant?: string | null;
  market?: string | null;
  family?: { id: string; code: string; name: string } | null;
};

const line = (over: Line) => ({
  productId: over.productId,
  product:
    over.productId === null
      ? null
      : {
          name: over.name ?? "ZEN 1L",
          sku: over.sku ?? "ZEN-SC-1000",
          variant: over.variant ?? null,
          market: over.market ?? null,
          family: over.family ?? null,
        },
});

/** One order, placed before the window opens and still in production. */
const order = (over: {
  id: string;
  buyer?: string;
  poNumber?: string | null;
  lines: Line[];
}) => ({
  id: over.id,
  buyerId: "byr_1",
  deliveryDate: new Date("2026-09-30T00:00:00Z"),
  poNumber: over.poNumber ?? `PO-${over.id}`,
  buyerReference: null,
  webOrder: null,
  buyer: { name: over.buyer ?? "Meridian Chemicals" },
  lineItems: over.lines.map(line),
  stageEvents: [
    {
      fromStage: null,
      toStage: PoStage.ORDER_PLACED,
      changedAt: new Date("2026-09-10T02:00:00Z"),
    },
  ],
});

const LEMON = {
  productId: "prd_lemon",
  name: "MR.KING 1.5L — Lemon",
  sku: "MRK-DW-1500-LE",
  variant: "Lemon",
  market: "Mydin",
  family: { id: "fam_mrk", code: "MRK-DW-1500", name: "MR.KING dishwash" },
};
const GOATS = {
  productId: "prd_goats",
  name: "ZEN 2.1L — Goat's Milk",
  sku: "ZEN-SC-2100-GM",
  variant: "Goat's Milk",
  market: "Vietnam",
  family: { id: "fam_zen", code: "ZEN-SC-2100", name: "Zen shower cream" },
};

const ROWS = [
  // Carries both products, so a product filter must narrow its *lines*
  // without taking the order off the bars.
  order({ id: "a", lines: [LEMON, GOATS] }),
  order({ id: "b", buyer: "Pacific Timber", lines: [GOATS] }),
  // A line that matched no product at all — the remainder row.
  order({ id: "c", buyer: "Sunway Packaging", lines: [{ productId: null }] }),
];

const board = (filters?: Parameters<typeof loadPoStageBoard>[4]) => {
  findMany.mockResolvedValue(ROWS);
  return loadPoStageBoard(FROM, TO, "day", "all", filters);
};

/** Every bar's total, which is what the chart draws. */
const bars = (b: Awaited<ReturnType<typeof loadPoStageBoard>>) =>
  b.points.map((p) => p.total);
/** The legend's own sum, which must be the last bar and nothing else. */
const legend = (b: Awaited<ReturnType<typeof loadPoStageBoard>>) =>
  b.breakdown.reduce((n, row) => n + row.count, 0);

describe("loadPoStageBoard, unfiltered", () => {
  it("draws every open order on every bar", async () => {
    const b = await board();
    expect(bars(b)).toEqual([3, 3, 3]);
    expect(b.orderCount).toBe(3);
    expect(b.openCount).toBe(3);
    expect(b.all.map((r) => r.productId)).toEqual([
      "prd_goats",
      "prd_lemon",
      "*none",
    ]);
  });
});

describe("the page's filters narrow the whole board", () => {
  it("a product filter narrows the bars, the legend, the table and the count together", async () => {
    const b = await board({ productId: "prd_lemon" });
    // Only order `a` carries Lemon.
    expect(bars(b)).toEqual([1, 1, 1]);
    expect(legend(b)).toBe(1);
    expect(b.orderCount).toBe(1);
    expect(b.openCount).toBe(1);
    // …and `a`'s own Goat's Milk line goes with it, so the table is one row.
    expect(b.all.map((r) => r.productId)).toEqual(["prd_lemon"]);
    expect(b.all[0].total).toBe(1);
    expect(Object.keys(b.orders)).toEqual(["a"]);
  });

  it("a family filter keeps every order carrying that family", async () => {
    const b = await board({ family: "fam_zen" });
    expect(bars(b)).toEqual([2, 2, 2]);
    expect(legend(b)).toBe(2);
    expect(b.all.map((r) => r.productId)).toEqual(["prd_goats"]);
    expect(b.all[0].total).toBe(2);
  });

  it("a search on a SKU narrows an order's lines without dropping the order", async () => {
    const b = await board({ q: "mrk-dw" });
    expect(bars(b)).toEqual([1, 1, 1]);
    expect(b.all.map((r) => r.productId)).toEqual(["prd_lemon"]);
  });

  it("a search on a variant and on a market both find their product", async () => {
    expect(bars(await board({ q: "goat's milk" }))).toEqual([2, 2, 2]);
    expect(bars(await board({ q: "vietnam" }))).toEqual([2, 2, 2]);
  });

  it("a search on a buyer keeps that buyer's order, line without a product and all", async () => {
    const b = await board({ q: "sunway" });
    expect(bars(b)).toEqual([1, 1, 1]);
    // The remainder row carries none of the product fields and is still
    // reachable by the buyer who sent it.
    expect(b.all.map((r) => r.productId)).toEqual(["*none"]);
    expect(Object.keys(b.orders)).toEqual(["c"]);
  });

  it("a search on the PO number finds exactly its order", async () => {
    const b = await board({ q: "po-b" });
    expect(bars(b)).toEqual([1, 1, 1]);
    expect(Object.keys(b.orders)).toEqual(["b"]);
  });

  it("a filter nothing matches empties the board rather than half of it", async () => {
    const b = await board({ q: "nothing-matches-this" });
    expect(bars(b)).toEqual([0, 0, 0]);
    expect(legend(b)).toBe(0);
    expect(b.orderCount).toBe(0);
    expect(b.openCount).toBe(0);
    expect(b.all).toEqual([]);
    expect(b.orders).toEqual({});
  });

  it("whitespace alone is not a filter", async () => {
    expect(bars(await board({ q: "   " }))).toEqual([3, 3, 3]);
  });

  it("the filters compose by intersection", async () => {
    // Lemon is in the MR.KING family, so this keeps order `a`…
    expect(bars(await board({ productId: "prd_lemon", family: "fam_mrk" }))).toEqual([
      1, 1, 1,
    ]);
    // …and asking for Lemon inside the Zen family matches no line at all.
    expect(bars(await board({ productId: "prd_lemon", family: "fam_zen" }))).toEqual([
      0, 0, 0,
    ]);
  });
});
