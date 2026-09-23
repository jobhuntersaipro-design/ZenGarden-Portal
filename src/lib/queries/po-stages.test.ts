import { describe, expect, it, vi } from "vitest";
import { PoStage } from "@/generated/prisma/enums";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { purchaseOrder: { findMany } },
}));

const { loadPoStageBoard } = await import("@/lib/queries/po-stages");

/** Midday on Thursday 17 Sep 2026, in KL — "now" for every board below. */
const NOW = new Date("2026-09-17T12:00:00+08:00");

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

type Options = Parameters<typeof loadPoStageBoard>[0];

const board = (over: Partial<Options> = {}) => {
  findMany.mockResolvedValue(ROWS);
  return loadPoStageBoard({ grain: "day", periods: 3, show: "all", now: NOW, ...over });
};

/** The same board, narrowed by the page's filters. */
const filtered = (filters: NonNullable<Options["filters"]>) => board({ filters });

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
    const b = await filtered({ productId: "prd_lemon" });
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
    const b = await filtered({ family: "fam_zen" });
    expect(bars(b)).toEqual([2, 2, 2]);
    expect(legend(b)).toBe(2);
    expect(b.all.map((r) => r.productId)).toEqual(["prd_goats"]);
    expect(b.all[0].total).toBe(2);
  });

  it("a search on a SKU narrows an order's lines without dropping the order", async () => {
    const b = await filtered({ q: "mrk-dw" });
    expect(bars(b)).toEqual([1, 1, 1]);
    expect(b.all.map((r) => r.productId)).toEqual(["prd_lemon"]);
  });

  it("a search on a variant and on a market both find their product", async () => {
    expect(bars(await filtered({ q: "goat's milk" }))).toEqual([2, 2, 2]);
    expect(bars(await filtered({ q: "vietnam" }))).toEqual([2, 2, 2]);
  });

  it("a search on a buyer keeps that buyer's order, line without a product and all", async () => {
    const b = await filtered({ q: "sunway" });
    expect(bars(b)).toEqual([1, 1, 1]);
    // The remainder row carries none of the product fields and is still
    // reachable by the buyer who sent it.
    expect(b.all.map((r) => r.productId)).toEqual(["*none"]);
    expect(Object.keys(b.orders)).toEqual(["c"]);
  });

  it("a search on the PO number finds exactly its order", async () => {
    const b = await filtered({ q: "po-b" });
    expect(bars(b)).toEqual([1, 1, 1]);
    expect(Object.keys(b.orders)).toEqual(["b"]);
  });

  it("a filter nothing matches empties the board rather than half of it", async () => {
    const b = await filtered({ q: "nothing-matches-this" });
    expect(bars(b)).toEqual([0, 0, 0]);
    expect(legend(b)).toBe(0);
    expect(b.orderCount).toBe(0);
    expect(b.openCount).toBe(0);
    expect(b.all).toEqual([]);
    expect(b.orders).toEqual({});
  });

  it("whitespace alone is not a filter", async () => {
    expect(bars(await filtered({ q: "   " }))).toEqual([3, 3, 3]);
  });

  it("the filters compose by intersection", async () => {
    // Lemon is in the MR.KING family, so this keeps order `a`…
    expect(bars(await filtered({ productId: "prd_lemon", family: "fam_mrk" }))).toEqual([
      1, 1, 1,
    ]);
    // …and asking for Lemon inside the Zen family matches no line at all.
    expect(bars(await filtered({ productId: "prd_lemon", family: "fam_zen" }))).toEqual([
      0, 0, 0,
    ]);
  });
});

describe("the grain and the span come from the page's toolbar", () => {
  /** What each bar is labelled, which is what the axis draws. */
  const labels = (b: Awaited<ReturnType<typeof loadPoStageBoard>>) =>
    b.points.map((p) => p.label);

  it("draws the span it is given, ending today", async () => {
    expect(labels(await board({ periods: 3 }))).toEqual([
      "15 Sep",
      "16 Sep",
      "17 Sep",
    ]);
    expect(labels(await board({ periods: 5 }))).toEqual([
      "13 Sep",
      "14 Sep",
      "15 Sep",
      "16 Sep",
      "17 Sep",
    ]);
  });

  it("reads the same span backwards at every grain", async () => {
    // Weeks start Monday, so three weeks ending Thursday 17 Sep run from the
    // week of the 31st.
    expect(labels(await board({ grain: "week", periods: 3 }))).toEqual([
      "31 Aug–6 Sep",
      "7–13 Sep",
      "14–20 Sep",
    ]);
    expect(labels(await board({ grain: "month", periods: 3 }))).toEqual([
      "Jul 2026",
      "Aug 2026",
      "Sep 2026",
    ]);
  });

  it("carries the grain back out, so the caption can name it", async () => {
    expect((await board({ grain: "month", periods: 3 })).grain).toBe("month");
  });

  it("reads the period still running as everything so far, not as its first day", async () => {
    // Every fixture order was placed on 10 Sep. A month bucket that ended at
    // its own start would read zero for September, because nothing had
    // happened by the 1st.
    const b = await board({ grain: "month", periods: 3 });
    expect(b.points.map((p) => p.total)).toEqual([0, 0, 3]);
    expect(b.orderCount).toBe(3);
  });

  it("clamps a span past the grain's ceiling rather than drawing it", async () => {
    expect((await board({ periods: 10_000 })).points.length).toBe(365);
  });

  it("'all' goes back only as far as there is something to show", async () => {
    // The ceiling is 365 days; the orders begin on 10 Sep, so the board opens
    // there rather than drawing a year of empty bars.
    const b = await board({ periods: "all" });
    expect(labels(b)[0]).toBe("10 Sep");
    expect(b.points.length).toBe(8);
  });

  it("'all' still draws an axis when the filter leaves nothing", async () => {
    const b = await board({ periods: "all", filters: { q: "nothing" } });
    expect(b.points.length).toBe(1);
    expect(b.orderCount).toBe(0);
  });
});
