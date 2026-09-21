import { addDays, addMonths, addWeeks } from "date-fns";
import { PoStage } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import { DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";

export { DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";

export type DemandWindow = number | "all";

/** One step of the grain, for walking out the window's last period. */
const STEP = { day: addDays, week: addWeeks, month: addMonths } as const;

export type DemandColumn = { key: string; label: string };

export type DemandRow = {
  productId: string;
  sku: string;
  name: string;
  variant: string | null;
  market: string | null;
  /** Cartons on hand, null where nobody has counted (2026-09-21). */
  stockCartons: number | null;
  /** Cartons wanted, by column key. Absent keys are nothing, not zero. */
  byColumn: Record<string, number>;
  /** Wanted before the period the board opens on — late, and not delivered. */
  overdue: number;
  /** Cartons across every column shown, `overdue` included. */
  committed: number;
  /** How many open orders those cartons come from. */
  orders: number;
  /**
   * Cartons committed beyond what is counted, or null where nobody has
   * counted. Never negative: a surplus is not a shortfall.
   */
  shortBy: number | null;
};

export type DemandBoard = {
  grain: DemandGrain;
  columns: DemandColumn[];
  rows: DemandRow[];
  /** Column totals, by column key, plus the same two summary figures. */
  totals: { byColumn: Record<string, number>; overdue: number; committed: number };
  openOrders: number;
  /** Products on the board that carry a stock count. */
  counted: number;
  anyOverdue: boolean;
};

/**
 * A bucket key back to the label the charts already use — `6–12 Jul` for a
 * week, `9 Sep` for a day, `Sep 2026` for a month. Every one comes from
 * `makeBuckets` rather than a second formatter, so the board and every chart
 * in the portal name a period the same way.
 */
function labelFor(key: string, grain: DemandGrain): DemandColumn {
  const start = new Date(`${key}T00:00:00+08:00`);
  return { key, label: makeBuckets(start, start, grain)[0]?.label ?? key };
}

/**
 * What is committed, by product, by day, week or month.
 *
 * Every figure here is derived from orders that already exist — no new table,
 * nothing retyped. An order counts while it is not `DELIVERED` and carries an
 * expected delivery date; its line items are in cartons (`LineItem.unit`
 * reads "carton" on every row) and resolve to a product.
 *
 * What it deliberately cannot show is cover: `Product.stockCartons` is null
 * across the catalogue until somebody counts, and a plausible-looking number
 * in that column would be the spreadsheet's own failure mode. `shortBy` is
 * null until there is a count to subtract from, and the board says so.
 *
 * A line whose `productId` is null is left out rather than bucketed as
 * "unknown": it is an extraction that never matched the catalogue, and it
 * belongs in the review queue, not in a production plan.
 */
export async function loadDemandBoard(
  grain: DemandGrain = "week",
  window: DemandWindow = DEMAND_SPAN[grain],
  now: Date = new Date(),
): Promise<DemandBoard> {
  const lines = await prisma.lineItem.findMany({
    where: {
      productId: { not: null },
      purchaseOrder: {
        stage: { not: PoStage.DELIVERED },
        deliveryDate: { not: null },
      },
    },
    select: {
      quantity: true,
      productId: true,
      purchaseOrderId: true,
      purchaseOrder: { select: { deliveryDate: true } },
      product: {
        select: {
          sku: true,
          name: true,
          variant: true,
          market: true,
          stockCartons: true,
        },
      },
    },
  });

  const current = bucketKey(now, grain);
  const step = STEP[grain];
  const columns =
    window === "all"
      ? []
      : makeBuckets(now, step(now, window - 1), grain).map(({ key, label }) => ({
          key,
          label,
        }));
  const shown = new Set(columns.map((c) => c.key));

  const rows = new Map<string, DemandRow>();
  const seenOrders = new Map<string, Set<string>>();
  const totals: DemandBoard["totals"] = { byColumn: {}, overdue: 0, committed: 0 };
  const allOrders = new Set<string>();

  for (const line of lines) {
    // Narrowed by the `where` above; Prisma types both as nullable.
    if (!line.productId || !line.product || !line.purchaseOrder.deliveryDate) continue;

    const key = bucketKey(line.purchaseOrder.deliveryDate, grain);
    const late = key < current;
    // Outside the window and not late: a later period the board is not showing.
    if (!late && window !== "all" && !shown.has(key)) continue;

    const cartons = Number(line.quantity);
    const row =
      rows.get(line.productId) ??
      ({
        productId: line.productId,
        sku: line.product.sku,
        name: line.product.name,
        variant: line.product.variant,
        market: line.product.market,
        stockCartons: line.product.stockCartons,
        byColumn: {},
        overdue: 0,
        committed: 0,
        orders: 0,
        shortBy: null,
      } satisfies DemandRow);

    if (late) {
      row.overdue += cartons;
      totals.overdue += cartons;
    } else {
      row.byColumn[key] = (row.byColumn[key] ?? 0) + cartons;
      totals.byColumn[key] = (totals.byColumn[key] ?? 0) + cartons;
    }
    row.committed += cartons;
    totals.committed += cartons;

    const orders = seenOrders.get(line.productId) ?? new Set<string>();
    orders.add(line.purchaseOrderId);
    seenOrders.set(line.productId, orders);
    allOrders.add(line.purchaseOrderId);

    rows.set(line.productId, row);
  }

  const out = [...rows.values()].map((row) => ({
    ...row,
    orders: seenOrders.get(row.productId)?.size ?? 0,
    shortBy:
      row.stockCartons === null
        ? null
        : Math.max(0, row.committed - row.stockCartons),
  }));

  // Most committed first: the board is read to decide what to make next, and
  // a shortfall sort is impossible until stock is counted.
  out.sort((a, b) => b.committed - a.committed || a.sku.localeCompare(b.sku));

  // "All open" has no fixed window, so its columns are whichever periods the
  // orders actually fall in — an empty one nobody promised anything in is not
  // worth a column here, unlike on a chart's axis. It matters most by day:
  // every open order spread over a year is 365 mostly empty columns.
  const allColumns =
    window === "all"
      ? [...new Set(Object.keys(totals.byColumn))]
          .sort()
          .map((key) => labelFor(key, grain))
      : columns;

  return {
    grain,
    columns: allColumns,
    rows: out,
    totals,
    openOrders: allOrders.size,
    counted: out.filter((r) => r.stockCartons !== null).length,
    anyOverdue: totals.overdue > 0,
  };
}
