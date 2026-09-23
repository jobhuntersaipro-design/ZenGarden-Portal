import { addDays, subDays } from "date-fns";
import { PoEventKind, PoStage } from "@/generated/prisma/enums";
import { formatDate, TIME_ZONE, type Aggregation } from "@/lib/dates";
import { ORDER_IDENTITY_SELECT, orderIdentity, orderLabel } from "@/lib/order-identity";
import { prisma } from "@/lib/prisma";
import { makeBuckets } from "@/lib/analytics/buckets";
import { boardHaystack } from "@/lib/planning/search";
import {
  openAt,
  pointBreakdown,
  stageSnapshotSeries,
  type Snapshot,
  type StageOrder,
  type StageShow,
  type StageSplitBreakdown,
  type StageSplitPoint,
} from "@/lib/analytics/stage-history";
import {
  stageByProduct,
  stageProductsByBucket,
  type StageProductRow,
} from "@/lib/analytics/stage-products";

/** `2026-09-17` for a `@db.Date`, which Prisma hands back at UTC midnight. */
const iso = (value: Date) => value.toISOString().slice(0, 10);
/** The same for a bucket boundary, which is a real instant in Kuala Lumpur. */
const isoDay = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(value);

/** Only the latest revision of a PO counts; a superseded one is history. */
const LATEST_ONLY = { supersededBy: { is: null } } as const;

/**
 * Narrow on purpose: this card answers "how many orders, at which stage,
 * carrying what" and needs nothing else. Money is not read at all — the y
 * axis is an order count and the table below it is a count too.
 *
 * `stageEvents` is the load-bearing part: the board replays each order's own
 * history to place it on a given day, so it cannot be built from the `stage`
 * column alone. `EDIT` rows are excluded — they carry the stage the order was
 * already at, so replaying them is a no-op, but reading them would make that
 * an accident rather than a rule.
 */
const SELECT = {
  id: true,
  buyerId: true,
  deliveryDate: true,
  ...ORDER_IDENTITY_SELECT,
  buyer: { select: { name: true } },
  lineItems: {
    select: {
      productId: true,
      // Wider than the board draws, and only the search reads the extra
      // columns: the toolbar above this board is the committed table's too,
      // so a search for a SKU, a variant, a market or a family has to find
      // the same orders here that it finds there.
      product: {
        select: {
          name: true,
          sku: true,
          variant: true,
          market: true,
          family: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
  stageEvents: {
    where: { kind: PoEventKind.STAGE },
    // `fromStage` is what lets the replay chain two moves that share a
    // timestamp, where their order in this list decides nothing.
    select: { fromStage: true, toStage: true, changedAt: true },
    orderBy: { changedAt: "asc" },
  },
} as const;

/**
 * One order's identity, carried once for the whole board.
 *
 * The per-bucket matrix stores ids and stages; this is what a row joins
 * against to draw its expansion. Written the way the demand board's own
 * sub-row reads it, because a planner chasing a late order quotes the
 * buyer's number and ours, and neither ever stands in for the other.
 */
export type StageOrderMeta = {
  purchaseOrderId: string;
  buyerName: string;
  /** `PO number …`, or `Order ID W-…` on a shop order carrying no PO number. */
  label: string;
  /** `Order ID W-…` under the label, absent where there is nothing to add. */
  orderIdLabel: string | null;
  /** Formatted on the server, in Kuala Lumpur, so the browser cannot drift it. */
  deliveryDate: string | null;
  /** The calendar day itself, so a bucket can say how late it was *then*. */
  deliveryIso: string | null;
};

/**
 * The page's own filters, which this board reads because the toolbar that
 * writes them now sits directly above it.
 *
 * Only the three that pick **which orders** — the search box, the family and
 * the product. Grain and window are deliberately not among them: the
 * committed board looks forward from today and this one looks back, so one
 * window cannot mean both, and this board keeps its own `?stage_window=`.
 */
export type StageFilters = {
  q?: string;
  family?: string;
  productId?: string;
};

export type PoStageBoard = {
  /** One bar per day, in the order the chart draws them. */
  points: StageSplitPoint[];
  /** Every open stage with its count and its late share, as things stand now. */
  breakdown: StageSplitBreakdown;
  /** Per product, as things stand now — what the table shows at rest. */
  all: StageProductRow[];
  /** The same, one entry per bucket key, so a hover needs no round trip. */
  byBucket: Record<string, StageProductRow[]>;
  /** Every order the board drew, by id, for the product rows' expansions. */
  orders: Record<string, StageOrderMeta>;
  /** Open orders right now, under the filter in force. */
  orderCount: number;
  /** How many of those are past their expected delivery date. */
  overdueCount: number;
  /**
   * Open orders right now whatever `show` says — what "of N in hand" reads.
   * The page's own filters *do* narrow it, so "8 overdue of 27 in hand"
   * counts 27 of the orders the search left, not of the whole board.
   */
  openCount: number;
  show: StageShow;
};

/**
 * The stage board: **a snapshot per day, not a timeline of order dates.**
 *
 * Each bar answers "where did every open order stand when that day ran out",
 * so an order confirmed on the 12th and still in production on the 15th is
 * counted on the 12th, 13th, 14th and 15th alike and leaves In production the
 * day it passes QC. The previous build bucketed orders by `poDate` and
 * coloured them by their stage *today*, which made old bars trend Delivered
 * purely because time had passed.
 *
 * **Why the `where` is not a date range.** An order is on the board for every
 * day between its confirm and its delivery, so the rows needed are the ones
 * that were open *during* the window rather than dated inside it: everything
 * still open whenever it was confirmed, plus everything delivered since the
 * window opened. An order delivered before that is the only thing excluded,
 * and it could never appear on any bar.
 *
 * **The page's filters are applied in exactly one place** — here, while the
 * rows become orders — so the bars, the legend, the table and every row's
 * expansion all walk the same narrowed list. A chart counting 27 under a
 * heading of 8 is then impossible by construction rather than by care.
 */
export async function loadPoStageBoard(
  from: Date,
  to: Date,
  agg: Aggregation,
  show: StageShow = "all",
  filters: StageFilters = {},
): Promise<PoStageBoard> {
  const buckets = makeBuckets(from, to, agg);

  // A bucket's period runs out when the next one opens; the last runs to the
  // end of its own day, which for today is simply "everything so far".
  //
  // `day` is the last calendar day *inside* the bucket, which is what
  // lateness is measured against — at daily grain the key itself, and at a
  // coarser one the day before the next bucket opens, because a promise for
  // the 3rd is not broken until the week holding it has run out.
  const snapshots: Snapshot[] = buckets.map((bucket, i) => {
    const next = buckets[i + 1];
    return {
      key: bucket.key,
      label: bucket.label,
      end: next?.start ?? addDays(bucket.start, 1),
      day: next ? isoDay(subDays(next.start, 1)) : isoDay(bucket.start),
    };
  });
  const last = snapshots.at(-1);

  const rows = await prisma.purchaseOrder.findMany({
    where: {
      ...LATEST_ONLY,
      OR: [
        { stage: { not: PoStage.DELIVERED } },
        { stageChangedAt: { gte: buckets[0]?.start ?? from } },
      ],
    },
    select: SELECT,
  });

  const query = filters.q?.trim().toLowerCase() ?? "";
  // Whether anything is narrowing at all. Without it, an order carrying no
  // line items would start dropping off a board it has always been on — the
  // filter is allowed to empty a board, an absent one is not.
  const narrowing = Boolean(query || filters.family || filters.productId);

  const orders: StageOrder[] = [];
  const meta: Record<string, StageOrderMeta> = {};

  for (const row of rows) {
    const identity = orderIdentity(row);
    const buyerName = row.buyer?.name ?? "Unknown buyer";
    // The buyer's own number leads, because that is what a planner quotes
    // when they chase a late order — the reverse of `orderLabel`'s
    // preference, which serves surfaces with room for exactly one.
    const label = identity.poNumber
      ? `PO number ${identity.poNumber}`
      : orderLabel(identity);
    const orderIdLabel =
      identity.orderId && identity.poNumber
        ? `Order ID ${identity.orderId}`
        : null;

    // An order stays on the board while it carries a line the filter keeps,
    // and keeps only those lines — so a search for one product leaves the
    // bars counting the orders that carry it and the table showing that
    // product alone, rather than the two disagreeing about the population.
    const lineItems = row.lineItems
      .filter((line) => {
        if (filters.productId && line.productId !== filters.productId)
          return false;
        if (filters.family && line.product?.family?.id !== filters.family)
          return false;
        if (!query) return true;
        // A line that matched no product carries none of the product half
        // and is still findable by its buyer or either identifier, which is
        // how the remainder row survives a search that names one.
        return boardHaystack({
          sku: line.product?.sku,
          name: line.product?.name,
          variant: line.product?.variant,
          market: line.product?.market,
          familyCode: line.product?.family?.code,
          familyName: line.product?.family?.name,
          buyerName,
          label,
          orderIdLabel,
        }).includes(query);
      })
      .map((line) => ({
        productId: line.productId,
        productName: line.product?.name ?? null,
      }));

    if (narrowing && lineItems.length === 0) continue;

    orders.push({
      id: row.id,
      deliveryDate: row.deliveryDate ? iso(row.deliveryDate) : null,
      stageEvents: row.stageEvents,
      lineItems,
    });
    meta[row.id] = {
      purchaseOrderId: row.id,
      buyerName,
      label,
      orderIdLabel,
      deliveryDate: row.deliveryDate ? formatDate(row.deliveryDate) : null,
      deliveryIso: row.deliveryDate ? iso(row.deliveryDate) : null,
    };
  }

  const points = stageSnapshotSeries(orders, snapshots, show);
  const now = points.at(-1);

  return {
    points,
    // The legend is the last bar, never a second count of the same orders.
    breakdown: now ? pointBreakdown(now) : [],
    all: last ? stageByProduct(orders, last, show) : [],
    byBucket: stageProductsByBucket(orders, snapshots, show),
    orders: meta,
    orderCount: now?.total ?? 0,
    overdueCount: now?.lateTotal ?? 0,
    openCount: last
      ? openAt(orders, last).length
      : 0,
    show,
  };
}
