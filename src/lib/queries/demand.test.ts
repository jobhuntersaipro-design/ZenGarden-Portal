import { describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { lineItem: { findMany } } }));

const { loadDemandBoard, DEMAND_SPAN } = await import("@/lib/queries/demand");

/** Monday 7 Sep 2026, in KL. The board's "this week" throughout. */
const NOW = new Date("2026-09-07T04:00:00Z");

const line = (over: {
  productId?: string | null;
  sku?: string;
  cartons?: number;
  deliveryDate?: string;
  orderId?: string;
  stockCartons?: number | null;
}) => ({
  quantity: over.cartons ?? 10,
  productId: "productId" in over ? over.productId : "p1",
  purchaseOrderId: over.orderId ?? "po1",
  purchaseOrder: { deliveryDate: new Date(`${over.deliveryDate ?? "2026-09-09"}T00:00:00Z`) },
  product: {
    sku: over.sku ?? "SKU-1",
    name: "ZEN 2.1L",
    variant: null,
    market: null,
    stockCartons: "stockCartons" in over ? over.stockCartons! : null,
  },
});

describe("loadDemandBoard", () => {
  it("only reads orders that are open and dated", async () => {
    findMany.mockResolvedValue([]);
    await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const where = findMany.mock.calls.at(-1)![0].where;
    expect(where.productId).toEqual({ not: null });
    expect(where.purchaseOrder.stage).toEqual({ not: "DELIVERED" });
    expect(where.purchaseOrder.deliveryDate).toEqual({ not: null });
  });

  it("sums cartons per product per week, and counts the orders behind them", async () => {
    findMany.mockResolvedValue([
      line({ cartons: 12, deliveryDate: "2026-09-09", orderId: "a" }),
      line({ cartons: 8, deliveryDate: "2026-09-11", orderId: "b" }),
      line({ cartons: 5, deliveryDate: "2026-09-16", orderId: "a" }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const [row] = board.rows;
    // 9 and 11 Sep are the same week; 16 Sep is the next one.
    expect(row.byColumn["2026-09-07"]).toBe(20);
    expect(row.byColumn["2026-09-14"]).toBe(5);
    expect(row.committed).toBe(25);
    // Two orders, though three lines — order `a` appears twice.
    expect(row.orders).toBe(2);
    expect(board.openOrders).toBe(2);
  });

  /**
   * Late is not "week one". An order whose date has passed and which nobody
   * has delivered is the most urgent thing on the board, and folding it into
   * the current week would hide exactly that.
   */
  it("separates what is already late from this week", async () => {
    findMany.mockResolvedValue([
      line({ cartons: 30, deliveryDate: "2026-08-24" }),
      line({ cartons: 4, deliveryDate: "2026-09-09" }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(board.anyOverdue).toBe(true);
    expect(board.rows[0].overdue).toBe(30);
    expect(board.rows[0].byColumn["2026-09-07"]).toBe(4);
    // Late cartons are still committed cartons.
    expect(board.rows[0].committed).toBe(34);
  });

  it("leaves out a week beyond the window, but never a late order", async () => {
    findMany.mockResolvedValue([
      line({ cartons: 7, deliveryDate: "2026-12-25" }),
      line({ cartons: 3, deliveryDate: "2026-08-01" }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(board.totals.committed).toBe(3);
    expect(board.rows[0].overdue).toBe(3);

    findMany.mockResolvedValue([
      line({ cartons: 7, deliveryDate: "2026-12-25" }),
      line({ cartons: 3, deliveryDate: "2026-08-01" }),
    ]);
    const all = await loadDemandBoard("week", "all", NOW);
    expect(all.totals.committed).toBe(10);
  });

  /**
   * The distinction the board rests on, and the one the spreadsheet cannot
   * make: nobody has counted is not the same as counted and short.
   */
  it("says nothing about a shortfall until stock is counted", async () => {
    findMany.mockResolvedValue([line({ cartons: 40, stockCartons: null })]);
    const uncounted = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(uncounted.rows[0].shortBy).toBeNull();
    expect(uncounted.counted).toBe(0);

    findMany.mockResolvedValue([line({ cartons: 40, stockCartons: 12 })]);
    const short = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(short.rows[0].shortBy).toBe(28);
    expect(short.counted).toBe(1);

    findMany.mockResolvedValue([line({ cartons: 40, stockCartons: 100 })]);
    const covered = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    // A surplus is not a negative shortfall.
    expect(covered.rows[0].shortBy).toBe(0);
  });

  it("puts the most committed product first", async () => {
    findMany.mockResolvedValue([
      { ...line({ cartons: 5 }), productId: "small", product: { ...line({}).product, sku: "B" } },
      { ...line({ cartons: 50 }), productId: "big", product: { ...line({}).product, sku: "A" } },
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(board.rows.map((r) => r.productId)).toEqual(["big", "small"]);
  });

  it("shows every week in the window, including the empty ones", async () => {
    findMany.mockResolvedValue([line({ cartons: 4, deliveryDate: "2026-09-09" })]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(board.columns).toHaveLength(DEMAND_SPAN.week);
    expect(board.columns[0]).toEqual({ key: "2026-09-07", label: "7–13 Sep" });
    // A week nobody promised anything in still gets a column.
    expect(board.totals.byColumn["2026-09-28"]).toBeUndefined();
  });
});

describe("loadDemandBoard, by day", () => {
  it("buckets by the day the order is expected, not the week", async () => {
    findMany.mockResolvedValue([
      line({ cartons: 12, deliveryDate: "2026-09-09", orderId: "a" }),
      line({ cartons: 8, deliveryDate: "2026-09-11", orderId: "b" }),
    ]);
    const board = await loadDemandBoard("day", 14, NOW);
    expect(board.grain).toBe("day");
    // The same two lines were one 20-carton week; they are two days apart.
    expect(board.rows[0].byColumn["2026-09-09"]).toBe(12);
    expect(board.rows[0].byColumn["2026-09-11"]).toBe(8);
    expect(board.rows[0].committed).toBe(20);
  });

  it("names a day the way every chart in the portal does", async () => {
    findMany.mockResolvedValue([line({ cartons: 4, deliveryDate: "2026-09-09" })]);
    const board = await loadDemandBoard("day", 7, NOW);
    expect(board.columns).toHaveLength(7);
    expect(board.columns[0]).toEqual({ key: "2026-09-07", label: "7 Sep" });
    expect(board.columns[2]).toEqual({ key: "2026-09-09", label: "9 Sep" });
  });

  /**
   * Late is measured at the grain being read. A delivery expected earlier in
   * this same week is not late on the weekly board — the week has not run out
   * — but it is late on the daily one, and a day view that said otherwise
   * would be no use for packing tomorrow's lorry.
   */
  it("calls yesterday late by day, and not by week", async () => {
    const yesterday = { cartons: 9, deliveryDate: "2026-09-06" };
    findMany.mockResolvedValue([line(yesterday)]);
    const daily = await loadDemandBoard("day", 14, NOW);
    expect(daily.rows[0].overdue).toBe(9);

    findMany.mockResolvedValue([line(yesterday)]);
    const weekly = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    // 6 Sep is the Sunday of the week before; still late either way.
    expect(weekly.rows[0].overdue).toBe(9);

    // Thursday of this week is not late by week, and not late by day either.
    findMany.mockResolvedValue([line({ cartons: 5, deliveryDate: "2026-09-10" })]);
    const ahead = await loadDemandBoard("day", 14, NOW);
    expect(ahead.rows[0].overdue).toBe(0);
    expect(ahead.rows[0].byColumn["2026-09-10"]).toBe(5);
  });

  it("drops a delivery beyond the day window that the week window would keep", async () => {
    findMany.mockResolvedValue([line({ cartons: 6, deliveryDate: "2026-09-25" })]);
    const daily = await loadDemandBoard("day", 7, NOW);
    expect(daily.totals.committed).toBe(0);

    findMany.mockResolvedValue([line({ cartons: 6, deliveryDate: "2026-09-25" })]);
    const weekly = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(weekly.totals.committed).toBe(6);
  });
});
