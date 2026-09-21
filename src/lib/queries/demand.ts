import { addWeeks } from "date-fns";
import { PoStage } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";

/** How many weeks the board shows before "All open" is asked for. */
export const DEMAND_WEEKS = 4;

export type DemandWindow = number | "all";

export type DemandWeek = { key: string; label: string };

export type DemandRow = {
  productId: string;
  sku: string;
  name: string;
  variant: string | null;
  market: string | null;
  /** Cartons on hand, null where nobody has counted (2026-09-21). */
  stockCartons: number | null;
  /** Cartons wanted, by week key. Absent keys are nothing, not zero. */
  byWeek: Record<string, number>;
  /** Wanted before this week — late, and still not delivered. */
  overdue: number;
  /** Cartons across every week shown, `overdue` included. */
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
  weeks: DemandWeek[];
  rows: DemandRow[];
  /** Column totals, by week key, plus the same two summary figures. */
  totals: { byWeek: Record<string, number>; overdue: number; committed: number };
  openOrders: number;
  /** Products on the board that carry a stock count. */
  counted: number;
  anyOverdue: boolean;
};

/** A week key back to the label the charts already use — `6–12 Jul`. */
function labelFor(key: string): DemandWeek {
  const start = new Date(`${key}T00:00:00+08:00`);
  return { key, label: makeBuckets(start, start, "week")[0]?.label ?? key };
}

/**
 * What is committed, by product, by week.
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
  window: DemandWindow = DEMAND_WEEKS,
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

  const thisWeek = bucketKey(now, "week");
  const weeks =
    window === "all"
      ? []
      : makeBuckets(now, addWeeks(now, window - 1), "week").map(
          ({ key, label }) => ({ key, label }),
        );
  const shown = new Set(weeks.map((w) => w.key));

  const rows = new Map<string, DemandRow>();
  const seenOrders = new Map<string, Set<string>>();
  const totals: DemandBoard["totals"] = { byWeek: {}, overdue: 0, committed: 0 };
  const allOrders = new Set<string>();

  for (const line of lines) {
    // Narrowed by the `where` above; Prisma types both as nullable.
    if (!line.productId || !line.product || !line.purchaseOrder.deliveryDate) continue;

    const key = bucketKey(line.purchaseOrder.deliveryDate, "week");
    const late = key < thisWeek;
    // Outside the window and not late: a later week the board is not showing.
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
        byWeek: {},
        overdue: 0,
        committed: 0,
        orders: 0,
        shortBy: null,
      } satisfies DemandRow);

    if (late) {
      row.overdue += cartons;
      totals.overdue += cartons;
    } else {
      row.byWeek[key] = (row.byWeek[key] ?? 0) + cartons;
      totals.byWeek[key] = (totals.byWeek[key] ?? 0) + cartons;
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

  // "All open" has no fixed window, so its columns are whichever weeks the
  // orders actually fall in — an empty week nobody promised anything in is
  // not worth a column here, unlike on a chart's axis.
  const allWeeks =
    window === "all"
      ? [...new Set(Object.keys(totals.byWeek))].sort().map(labelFor)
      : weeks;

  return {
    weeks: allWeeks,
    rows: out,
    totals,
    openOrders: allOrders.size,
    counted: out.filter((r) => r.stockCartons !== null).length,
    anyOverdue: totals.overdue > 0,
  };
}
