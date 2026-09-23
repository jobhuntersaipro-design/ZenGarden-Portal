import { addDays, addMonths, addWeeks, subDays } from "date-fns";
import { PoEventKind, PoStage } from "@/generated/prisma/enums";
import { formatDate, TIME_ZONE } from "@/lib/dates";
import { ORDER_IDENTITY_SELECT, orderIdentity, orderLabel } from "@/lib/order-identity";
import { prisma } from "@/lib/prisma";
import { makeBuckets } from "@/lib/analytics/buckets";
import { boardHaystack } from "@/lib/planning/search";
import { DEMAND_CEILING, type DemandGrain } from "@/lib/planning/grain";
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

/** One period back, at the grain being read. */
const STEP = { day: addDays, week: addWeeks, month: addMonths } as const;

/**
 * How many periods the board draws, mirroring the committed table above it.
 *
 * The toolbar's window is a **span**, not a direction: the committed board
 * projects it forward from today and this one replays it backward, so "Next
 * 6 months" at monthly grain is six monthly snapshots ending now. That is the
 * only reading that composes — a snapshot of what *has* happened cannot be
 * drawn into next March, and every future bar would repeat today.
 *
 * `all` is the span there is rather than a span asked for: it opens at the
 * grain's own ceiling and the empty buckets before the first order was open
 * are trimmed, so the board goes back exactly as far as it has anything to
 * show.
 */
export type StagePeriods = number | "all";

/**
 * The page's own filters, which this board reads because the toolbar that
 * writes them now sits directly above it.
 *
 * Only the three that pick **which orders** — the search box, the family and
 * the product. Grain and window are not filters and are not here: they say
 * how the board is *drawn*, and arrive as `grain` and `periods`.
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
  /** The grain the bars are drawn at, so the caption can name it. */
  grain: DemandGrain;
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
export async function loadPoStageBoard({
  grain,
  periods,
  show = "all",
  filters = {},
  now = new Date(),
}: {
  grain: DemandGrain;
  periods: StagePeriods;
  show?: StageShow;
  filters?: StageFilters;
  now?: Date;
}): Promise<PoStageBoard> {
  // The window ends today and reaches back, so the first bucket is the one
  // `span - 1` periods ago. A span past the grain's own ceiling is clamped
  // rather than refused: unlike a hand-typed `?window=`, this one arrives
  // from a control the committed board has already accepted.
  const span = Math.min(
    periods === "all" ? DEMAND_CEILING[grain] : periods,
    DEMAND_CEILING[grain],
  );
  const from = STEP[grain](now, -(span - 1));
  const buckets = makeBuckets(from, now, grain);

  // A bucket's period runs out when the next one opens; the **last** runs to
  // now rather than to the end of its own period, so a month that has not
  // finished reads as everything so far rather than as its first day.
  //
  // `day` is the last calendar day the bucket covers, which is what lateness
  // is measured against — at daily grain the key itself, at a coarser one the
  // day before the next bucket opens, because a promise for the 3rd is not
  // broken until the week holding it has run out, and today for the bucket
  // still running.
  const everyBucket: Snapshot[] = buckets.map((bucket, i) => {
    const next = buckets[i + 1];
    return {
      key: bucket.key,
      label: bucket.label,
      end: next?.start ?? addDays(now, 1),
      day: next ? isoDay(subDays(next.start, 1)) : isoDay(now),
    };
  });

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

  // **"All open" is the span there is, not the span asked for.** It opens at
  // the grain's ceiling, which is a year of days, so the buckets before the
  // earliest order was open are dropped rather than drawn as a long run of
  // empty bars. One always survives: a board narrowed to nothing still needs
  // an axis to say so on.
  const drawn = stageSnapshotSeries(orders, everyBucket, show);
  const first =
    periods === "all"
      ? Math.min(
          drawn.findIndex((point) => point.total > 0) === -1
            ? drawn.length - 1
            : drawn.findIndex((point) => point.total > 0),
          drawn.length - 1,
        )
      : 0;
  const snapshots = everyBucket.slice(Math.max(first, 0));
  const points = drawn.slice(Math.max(first, 0));

  const last = snapshots.at(-1);
  const current = points.at(-1);

  return {
    points,
    // The legend is the last bar, never a second count of the same orders.
    breakdown: current ? pointBreakdown(current) : [],
    all: last ? stageByProduct(orders, last, show) : [],
    byBucket: stageProductsByBucket(orders, snapshots, show),
    orders: meta,
    orderCount: current?.total ?? 0,
    overdueCount: current?.lateTotal ?? 0,
    openCount: last ? openAt(orders, last).length : 0,
    grain,
    show,
  };
}
