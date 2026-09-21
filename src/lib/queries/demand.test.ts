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
  buyer?: string;
  poNumber?: string | null;
  buyerReference?: string | null;
  webOrder?: string | null;
}) => ({
  quantity: over.cartons ?? 10,
  productId: "productId" in over ? over.productId : "p1",
  purchaseOrderId: over.orderId ?? "po1",
  purchaseOrder: {
    deliveryDate: new Date(`${over.deliveryDate ?? "2026-09-09"}T00:00:00Z`),
    stage: "ORDER_PLACED",
    buyer: { name: over.buyer ?? "Acme Industrial Sdn Bhd" },
    poNumber: "poNumber" in over ? over.poNumber : "PO-2026-0001",
    buyerReference: over.buyerReference ?? null,
    webOrder: over.webOrder ? { reference: over.webOrder } : null,
  },
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

describe("loadDemandBoard, by month", () => {
  it("buckets by the month the order is expected, not the week", async () => {
    findMany.mockResolvedValue([
      line({ cartons: 12, deliveryDate: "2026-09-09", orderId: "a" }),
      line({ cartons: 8, deliveryDate: "2026-09-28", orderId: "b" }),
      line({ cartons: 5, deliveryDate: "2026-10-02", orderId: "c" }),
    ]);
    const board = await loadDemandBoard("month", DEMAND_SPAN.month, NOW);
    expect(board.grain).toBe("month");
    // Three separate weeks; two months.
    expect(board.rows[0].byColumn["2026-09-01"]).toBe(20);
    expect(board.rows[0].byColumn["2026-10-01"]).toBe(5);
    expect(board.rows[0].committed).toBe(25);
    expect(board.rows[0].orders).toBe(3);
  });

  it("names a month the way every chart in the portal does", async () => {
    findMany.mockResolvedValue([line({ cartons: 4, deliveryDate: "2026-09-09" })]);
    const board = await loadDemandBoard("month", DEMAND_SPAN.month, NOW);
    expect(board.columns).toHaveLength(DEMAND_SPAN.month);
    expect(board.columns[0]).toEqual({ key: "2026-09-01", label: "Sep 2026" });
    // Six months from September reaches February, not March.
    expect(board.columns.at(-1)).toEqual({ key: "2027-02-01", label: "Feb 2027" });
  });

  it("keeps a December delivery that the four-week window drops", async () => {
    findMany.mockResolvedValue([line({ cartons: 7, deliveryDate: "2026-12-25" })]);
    const monthly = await loadDemandBoard("month", DEMAND_SPAN.month, NOW);
    expect(monthly.totals.byColumn["2026-12-01"]).toBe(7);

    findMany.mockResolvedValue([line({ cartons: 7, deliveryDate: "2026-12-25" })]);
    const weekly = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    expect(weekly.totals.committed).toBe(0);
  });

  /**
   * Late is measured at the grain being read, and the month is where that
   * bites hardest: a delivery expected on the 2nd is five days late today,
   * but the month it was promised in has not run out, so a monthly board
   * counts it in this month rather than calling it overdue.
   */
  it("counts an earlier day of this month as this month, not as late", async () => {
    const earlier = { cartons: 9, deliveryDate: "2026-09-02" };
    findMany.mockResolvedValue([line(earlier)]);
    const monthly = await loadDemandBoard("month", DEMAND_SPAN.month, NOW);
    expect(monthly.rows[0].overdue).toBe(0);
    expect(monthly.rows[0].byColumn["2026-09-01"]).toBe(9);
    expect(monthly.anyOverdue).toBe(false);

    findMany.mockResolvedValue([line(earlier)]);
    const daily = await loadDemandBoard("day", 14, NOW);
    expect(daily.rows[0].overdue).toBe(9);

    // Last month is late at every grain.
    findMany.mockResolvedValue([line({ cartons: 30, deliveryDate: "2026-08-24" })]);
    const august = await loadDemandBoard("month", DEMAND_SPAN.month, NOW);
    expect(august.rows[0].overdue).toBe(30);
  });
});

describe("the breakdown behind each figure", () => {
  it("is one entry per order, not per line item", async () => {
    // One document printing the same product twice, and a second order.
    findMany.mockResolvedValue([
      line({ cartons: 12, orderId: "a", deliveryDate: "2026-09-09" }),
      line({ cartons: 8, orderId: "a", deliveryDate: "2026-09-09" }),
      line({ cartons: 5, orderId: "b", deliveryDate: "2026-09-09" }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const [row] = board.rows;
    // Three line items, two promises.
    expect(row.lines).toHaveLength(2);
    expect(row.lines.map((l) => l.purchaseOrderId).sort()).toEqual(["a", "b"]);
    expect(row.lines.find((l) => l.purchaseOrderId === "a")!.cartons).toBe(20);
  });

  /**
   * The guard that makes the breakdown trustworthy: it has to agree with the
   * row it sits under, or the reader is being shown two different answers to
   * the same question in one grid.
   */
  it("sums to the row it sits under, per column and in total", async () => {
    findMany.mockResolvedValue([
      line({ cartons: 12, orderId: "a", deliveryDate: "2026-09-09" }),
      // Order `a` again, so `lines.length === orders` discriminates here too:
      // per-line grouping would make it five entries against four orders.
      line({ cartons: 3, orderId: "a", deliveryDate: "2026-09-09" }),
      line({ cartons: 8, orderId: "b", deliveryDate: "2026-09-16" }),
      line({ cartons: 5, orderId: "c", deliveryDate: "2026-09-16" }),
      line({ cartons: 30, orderId: "d", deliveryDate: "2026-08-24" }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const [row] = board.rows;

    // One entry per order, and that count is the figure the Orders column shows.
    expect(row.lines).toHaveLength(row.orders);

    for (const column of board.columns) {
      const fromLines = row.lines
        .filter((l) => l.columnKey === column.key)
        .reduce((sum, l) => sum + l.cartons, 0);
      expect(fromLines).toBe(row.byColumn[column.key] ?? 0);
    }
    const late = row.lines
      .filter((l) => l.columnKey === null)
      .reduce((sum, l) => sum + l.cartons, 0);
    expect(late).toBe(row.overdue);
    expect(row.lines.reduce((sum, l) => sum + l.cartons, 0)).toBe(row.committed);
  });

  it("names the buyer and the order, and says how late a late one is", async () => {
    findMany.mockResolvedValue([
      line({
        cartons: 30,
        orderId: "late",
        deliveryDate: "2026-08-27",
        buyer: "Kelana Steel",
      }),
      line({
        cartons: 4,
        orderId: "soon",
        deliveryDate: "2026-09-09",
        buyer: "Northwind Traders",
        poNumber: null,
        webOrder: "W-2609-00014",
      }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const [worst, next] = board.rows[0].lines;

    // Worst lateness first: 7 Sep less 27 Aug is eleven days.
    expect(worst.buyerName).toBe("Kelana Steel");
    expect(worst.daysLate).toBe(11);
    expect(worst.columnKey).toBeNull();
    expect(worst.label).toBe("PO number PO-2026-0001");
    expect(worst.deliveryDate).toBe("27 Aug 2026");
    // A scan has no Order ID at all, so there is no second line to print.
    expect(worst.orderIdLabel).toBeNull();

    // A shop order with no PO number is named by its Order ID, never by the
    // other column — and does not then repeat it underneath.
    expect(next.buyerName).toBe("Northwind Traders");
    expect(next.daysLate).toBe(0);
    expect(next.label).toBe("Order ID W-2609-00014");
    expect(next.orderIdLabel).toBeNull();
  });

  /**
   * A shop order carries both numbers, and the row has a line for each. The
   * buyer's own leads, because that is what a planner quotes when they chase
   * the order — which is the reverse of `orderLabel`'s preference, and so is
   * worth pinning rather than leaving to a shared helper to decide.
   */
  it("leads a shop order with the buyer's PO number and puts ours beneath", async () => {
    findMany.mockResolvedValue([
      line({
        poNumber: null,
        buyerReference: "ACME-PO-771",
        webOrder: "W-2609-00014",
      }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const [only] = board.rows[0].lines;

    expect(only.label).toBe("PO number ACME-PO-771");
    expect(only.orderIdLabel).toBe("Order ID W-2609-00014");
  });

  /**
   * On a scan, `buyerReference` is the retired Phase 11 extraction field
   * rather than a PO number, and there is no Order ID either — so neither
   * column may become a line on the row.
   */
  it("ignores a scan's buyer reference and gives it no Order ID", async () => {
    findMany.mockResolvedValue([
      line({ poNumber: null, buyerReference: "not-a-po-number" }),
    ]);
    const board = await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const [only] = board.rows[0].lines;

    expect(only.label).toBe("Purchase order");
    expect(only.orderIdLabel).toBeNull();
  });

  /**
   * `Buyer.remark` is an internal note about the customer. This board has no
   * business reading it, and a select that reaches a Buyer row once tends to
   * keep reaching it — so the shape is pinned rather than described.
   */
  it("reads the buyer's name and nothing else off that row", async () => {
    findMany.mockResolvedValue([]);
    await loadDemandBoard("week", DEMAND_SPAN.week, NOW);
    const select = findMany.mock.calls.at(-1)![0].select;
    expect(select.purchaseOrder.select.buyer).toEqual({ select: { name: true } });
  });
});
