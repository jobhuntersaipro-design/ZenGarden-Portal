import { addDays } from "date-fns";
import { PoEventKind, PoStage } from "@/generated/prisma/enums";
import type { Aggregation } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { makeBuckets } from "@/lib/analytics/buckets";
import type { StageBreakdown, StagePoint } from "@/lib/analytics/fulfillment";
import {
  stageSnapshotBreakdown,
  stageSnapshotSeries,
  type Snapshot,
  type StageOrder,
} from "@/lib/analytics/stage-history";
import {
  stageByProduct,
  stageProductsByBucket,
  type StageProductRow,
} from "@/lib/analytics/stage-products";

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
  lineItems: {
    select: {
      productId: true,
      product: { select: { name: true } },
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

export type PoStageBoard = {
  /** One bar per day, in the order the chart draws them. */
  points: StagePoint[];
  /** All six stages with their counts as things stand now. */
  breakdown: StageBreakdown;
  /** Per product, as things stand now — what the table shows at rest. */
  all: StageProductRow[];
  /** The same, one entry per bucket key, so a hover needs no round trip. */
  byBucket: Record<string, StageProductRow[]>;
  /** Open orders right now. */
  orderCount: number;
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
 */
export async function loadPoStageBoard(
  from: Date,
  to: Date,
  agg: Aggregation,
): Promise<PoStageBoard> {
  const buckets = makeBuckets(from, to, agg);

  // A bucket's period runs out when the next one opens; the last runs to the
  // end of its own day, which for today is simply "everything so far".
  const snapshots: Snapshot[] = buckets.map((bucket, i) => ({
    key: bucket.key,
    label: bucket.label,
    end: buckets[i + 1]?.start ?? addDays(bucket.start, 1),
  }));
  const now = snapshots.at(-1)?.end ?? to;

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

  const orders: StageOrder[] = rows.map((row) => ({
    stageEvents: row.stageEvents,
    lineItems: row.lineItems.map((line) => ({
      productId: line.productId,
      productName: line.product?.name ?? null,
    })),
  }));

  const breakdown = stageSnapshotBreakdown(orders, now);

  return {
    points: stageSnapshotSeries(orders, snapshots),
    breakdown,
    all: stageByProduct(orders, now),
    byBucket: stageProductsByBucket(orders, snapshots),
    orderCount: breakdown.reduce((sum, entry) => sum + entry.count, 0),
  };
}
