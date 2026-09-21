import { addDays, addMonths, addWeeks, differenceInCalendarDays } from "date-fns";
import { PoStage } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import { formatDate } from "@/lib/dates";
import { ORDER_IDENTITY_SELECT, orderIdentity, orderLabel } from "@/lib/order-identity";
import { DEMAND_CEILING, DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";

export { DEMAND_CEILING, DEMAND_SPAN, type DemandGrain } from "@/lib/planning/grain";

export type DemandWindow = number | "all";

/** One step of the grain, for walking out the window's last period. */
const STEP = { day: addDays, week: addWeeks, month: addMonths } as const;

/**
 * `yyyy-MM-dd` at Kuala Lumpur, for a date the planner picked.
 *
 * Parsed as UTC midnight on purpose rather than through a timezone library:
 * KL is +08:00 and keeps no daylight saving, so UTC midnight is 08:00 the
 * same calendar day there, and `bucketKey` — which converts to KL itself —
 * lands on the day that was typed. The reverse direction, a `@db.Date`
 * column compared against a timestamp, is the trap `dateColumnRange` exists
 * for; this one is not it.
 */
function parseUntil(until: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  const date = new Date(`${until}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The span that reaches a picked date, or null where the date cannot be
 * shown.
 *
 * Counted with `makeBuckets` rather than by arithmetic on the grain, so the
 * span and the columns it produces are the same walk — "up to 12 Mar" cannot
 * draw a board that stops on the 11th.
 *
 * Two dates are refused rather than bent: one whose bucket is already behind
 * the board (the board opens on today; "up to last Tuesday" has no answer),
 * and one past the grain's ceiling. The picker's own `max` stops the second
 * before it happens, so in practice that branch answers a hand-typed URL —
 * the same rule `?window=400` already follows.
 */
export function windowUntil(
  until: string,
  grain: DemandGrain,
  now: Date = new Date(),
): DemandWindow | null {
  const end = parseUntil(until);
  if (!end) return null;
  // `makeBuckets` returns one bucket for a backwards range rather than none,
  // so the order is checked here rather than read off the length.
  if (bucketKey(end, grain) < bucketKey(now, grain)) return null;
  const span = makeBuckets(now, end, grain).length;
  return span >= 1 && span <= DEMAND_CEILING[grain] ? span : null;
}

/**
 * The last date this grain will show, for the picker's own `max`.
 *
 * A picker that offers a date the board then refuses is a worse control than
 * one that greys it out, so the ceiling is expressed as a date here and as a
 * refusal in `windowUntil` — the first for the calendar, the second for a URL
 * somebody typed.
 */
export function lastPickableDate(grain: DemandGrain, now: Date = new Date()): string {
  const last = STEP[grain](now, DEMAND_CEILING[grain] - 1);
  return makeBuckets(last, last, grain)[0]?.key ?? bucketKey(now, grain);
}

/**
 * What the planner has narrowed the board to.
 *
 * `q`, `family` and `productId` narrow the **lines**, so every figure on the
 * board follows them: search a buyer and a row's cartons, Committed and
 * Orders are that buyer's alone. A board that kept whole totals above a
 * filtered breakdown would be showing a number it is not displaying.
 */
export type DemandFilters = {
  q?: string;
  family?: string;
  productId?: string;
};

/** A value the filter selects offer, and the count beside it. */
export type DemandOption = { value: string; label: string };

export type DemandColumn = { key: string; label: string };

/**
 * One open purchase order's share of a product's demand — the answer to
 * "the 371 is made of what?".
 *
 * **One per purchase order, not per line item.** A document that prints the
 * same product twice is still one promise to one buyer on one date, so the two
 * line items collapse here. That is also what keeps the breakdown honest
 * against the row it sits under: the number of these equals the row's `orders`
 * figure, and their cartons sum to its columns.
 */
export type DemandLine = {
  purchaseOrderId: string;
  /**
   * The identifier this row leads with, named: the buyer's own
   * `PO number …`, or `Order ID W-…` on a shop order that carries no PO
   * number. This is what the planner searches and quotes, which is why it is
   * the buyer's number rather than ours wherever there is one — the reverse
   * of `orderLabel`'s own preference, which serves surfaces that have room
   * for exactly one.
   */
  label: string;
  /**
   * `Order ID W-…`, shown under the label, and null where there is nothing to
   * add: a scanned purchase order has no Order ID at all, and a shop order
   * with no PO number already leads with it.
   */
  orderIdLabel: string | null;
  buyerName: string;
  stage: PoStage;
  /** The date on the buyer's own document. Formatted in Kuala Lumpur on the
   *  server, as every date here is, so the browser cannot drift it. */
  poDate: string;
  /** What we committed to: the expected delivery date. */
  deliveryDate: string;
  cartons: number;
  /** The column these cartons sit in, or null when the order is overdue. */
  columnKey: string | null;
  /** Calendar days past the expected date; 0 unless overdue. */
  daysLate: number;
  /**
   * Calendar days until the expected date, and null on an order the board
   * counts as overdue — that one reads its lateness instead.
   *
   * It can still be **negative**: "late" is measured at the grain being read,
   * so on a monthly board an order promised on the 5th is simply September
   * and not overdue, while its date is a fortnight gone. The figure says so
   * rather than rounding up to "due today"; only the red Overdue column is
   * grain-relative.
   */
  dueInDays: number | null;
};

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
  /** What the row's figures are made of: one entry per open order, worst
   * lateness first, then soonest expected. */
  lines: DemandLine[];
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
  /**
   * Every family and product with an open order, whatever the board is
   * filtered to — derived from the unfiltered read, so narrowing to one
   * family never removes the other families from the picker that would take
   * you back.
   */
  families: DemandOption[];
  products: DemandOption[];
};

/**
 * Both of an order's identifiers, for a row with two lines to spend on them.
 *
 * The buyer's own number leads, because a planner chasing an order quotes the
 * number the buyer filed it under. Ours goes underneath, where there is one
 * and where it is not already the line above — a scan has no Order ID, and a
 * shop order with no PO number leads with its Order ID rather than printing
 * it twice.
 */
function identityOf(
  po: Parameters<typeof orderIdentity>[0],
): Pick<DemandLine, "label" | "orderIdLabel"> {
  const identity = orderIdentity(po);
  return {
    label: identity.poNumber
      ? `PO number ${identity.poNumber}`
      : orderLabel(identity),
    orderIdLabel:
      identity.orderId && identity.poNumber
        ? `Order ID ${identity.orderId}`
        : null,
  };
}

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
/** Every field the search box looks in, lower-cased once per line. */
function haystack(
  product: { sku: string; name: string; variant: string | null; market: string | null },
  family: { code: string; name: string } | null,
  buyerName: string,
  label: string,
  orderIdLabel: string | null,
): string {
  return [
    product.sku,
    product.name,
    product.variant,
    product.market,
    family?.code,
    family?.name,
    buyerName,
    label,
    orderIdLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function loadDemandBoard({
  grain = "week",
  window = DEMAND_SPAN[grain],
  filters = {},
  now = new Date(),
}: {
  grain?: DemandGrain;
  window?: DemandWindow;
  filters?: DemandFilters;
  now?: Date;
} = {}): Promise<DemandBoard> {
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
      purchaseOrder: {
        select: {
          poDate: true,
          deliveryDate: true,
          stage: true,
          // Narrow on purpose: the planning board needs the buyer's name and
          // nothing else off that row. `Buyer.remark` is an internal note
          // about the customer, and a select that reaches it once tends to
          // keep reaching it. Pinned by equality in the tests.
          buyer: { select: { name: true } },
          ...ORDER_IDENTITY_SELECT,
        },
      },
      product: {
        select: {
          sku: true,
          name: true,
          variant: true,
          market: true,
          stockCartons: true,
          family: { select: { id: true, code: true, name: true } },
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
  const query = filters.q?.trim().toLowerCase() ?? "";

  const rows = new Map<string, DemandRow>();
  const seenOrders = new Map<string, Set<string>>();
  // product id → purchase order id → that order's share of this product.
  // Keyed by order rather than by line, so a document printing the same
  // product twice is one entry carrying both line items' cartons.
  const byOrder = new Map<string, Map<string, DemandLine>>();
  // Built from every open line, before any filter is applied — a picker that
  // narrowed itself to what is already selected could not be undone.
  const families = new Map<string, string>();
  const products = new Map<string, string>();

  for (const line of lines) {
    // Narrowed by the `where` above; Prisma types both as nullable.
    if (!line.productId || !line.product || !line.purchaseOrder.deliveryDate) continue;

    const family = line.product.family;
    if (family) families.set(family.id, family.name);
    products.set(line.productId, line.product.name);

    const identity = identityOf(line.purchaseOrder);
    if (filters.family && family?.id !== filters.family) continue;
    if (filters.productId && line.productId !== filters.productId) continue;
    if (
      query &&
      !haystack(
        line.product,
        family,
        line.purchaseOrder.buyer.name,
        identity.label,
        identity.orderIdLabel,
      ).includes(query)
    ) {
      continue;
    }

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
        // Both filled once every line has been seen: `orders` from the
        // distinct order ids, `lines` from the per-order breakdown.
        lines: [],
      } satisfies DemandRow);

    if (late) row.overdue += cartons;
    else row.byColumn[key] = (row.byColumn[key] ?? 0) + cartons;
    row.committed += cartons;

    const orders = seenOrders.get(line.productId) ?? new Set<string>();
    orders.add(line.purchaseOrderId);
    seenOrders.set(line.productId, orders);

    const breakdown = byOrder.get(line.productId) ?? new Map<string, DemandLine>();
    const already = breakdown.get(line.purchaseOrderId);
    if (already) {
      already.cartons += cartons;
    } else {
      const due = line.purchaseOrder.deliveryDate;
      breakdown.set(line.purchaseOrderId, {
        purchaseOrderId: line.purchaseOrderId,
        ...identity,
        buyerName: line.purchaseOrder.buyer.name,
        stage: line.purchaseOrder.stage,
        poDate: formatDate(line.purchaseOrder.poDate),
        deliveryDate: formatDate(due),
        cartons,
        columnKey: late ? null : key,
        // Real calendar days, not periods: "eleven days late" is what a
        // planner acts on, and it reads the same whichever grain is open.
        daysLate: late ? Math.max(0, differenceInCalendarDays(now, due)) : 0,
        dueInDays: late ? null : differenceInCalendarDays(due, now),
      });
    }
    byOrder.set(line.productId, breakdown);

    rows.set(line.productId, row);
  }

  const out = [...rows.values()]
    .map((row) => ({
      ...row,
      orders: seenOrders.get(row.productId)?.size ?? 0,
      shortBy:
        row.stockCartons === null
          ? null
          : Math.max(0, row.committed - row.stockCartons),
      // Worst lateness first — an order eleven days late is the one to ring
      // about — then the soonest expected, which is the order they ship in.
      lines: [...(byOrder.get(row.productId)?.values() ?? [])].sort(
        (a, b) =>
          b.daysLate - a.daysLate ||
          (a.columnKey ?? "").localeCompare(b.columnKey ?? "") ||
          b.cartons - a.cartons,
      ),
    }));

  // Most committed first: the board is read to decide what to make next, and
  // a shortfall sort is impossible until stock is counted.
  out.sort((a, b) => b.committed - a.committed || a.sku.localeCompare(b.sku));

  // Summed from the rows that survived rather than accumulated as the lines
  // went past, so the footer cannot outlive a filter that removed the row it
  // was counting. The footer is the rows above it, by construction.
  const totals: DemandBoard["totals"] = { byColumn: {}, overdue: 0, committed: 0 };
  const openOrders = new Set<string>();
  for (const row of out) {
    totals.overdue += row.overdue;
    totals.committed += row.committed;
    for (const [key, value] of Object.entries(row.byColumn)) {
      totals.byColumn[key] = (totals.byColumn[key] ?? 0) + value;
    }
    for (const line of row.lines) openOrders.add(line.purchaseOrderId);
  }

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

  const byLabel = (a: DemandOption, b: DemandOption) => a.label.localeCompare(b.label);

  return {
    grain,
    columns: allColumns,
    rows: out,
    totals,
    openOrders: openOrders.size,
    counted: out.filter((r) => r.stockCartons !== null).length,
    anyOverdue: totals.overdue > 0,
    families: [...families].map(([value, label]) => ({ value, label })).sort(byLabel),
    products: [...products].map(([value, label]) => ({ value, label })).sort(byLabel),
  };
}
