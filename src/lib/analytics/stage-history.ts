import { PoStage } from "@/generated/prisma/enums";
import { PO_STAGES } from "@/lib/po-stages";
import type { StageBreakdown, StagePoint } from "@/lib/analytics/fulfillment";

/** One recorded move, as `PoStageEvent` stores it. */
export type StageMove = {
  /** Null on the confirm event, which is where every order's history starts. */
  fromStage: PoStage | null;
  toStage: PoStage;
  changedAt: Date;
};

/**
 * What the stage board needs of a purchase order, and nothing else.
 *
 * Deliberately not `AnalyticsOrder`: this board reads no money, no buyer and
 * no PO date, and it needs `fromStage`, which that shared type does not
 * carry. Padding the unused halves with zeroes to borrow the type would make
 * the query look like it had figures it never read.
 */
export type StageOrder = {
  stageEvents: StageMove[];
  lineItems: { productId: string | null; productName: string | null }[];
};

/** A bucket, and the instant its period runs out. */
export type Snapshot = { key: string; label: string; end: Date };

const openOrNull = (stage: PoStage) =>
  stage === PoStage.DELIVERED ? null : stage;

/**
 * The stage an order stood at just before `end`, or null where it was not
 * open work then.
 *
 * **Replayed from the order's own events, never read off its current stage.**
 * The board this feeds is a snapshot per day: an order confirmed on the 12th
 * and still in production on the 15th belongs to the 12th, 13th, 14th and
 * 15th alike, under In production, and leaves that column the day it passes
 * QC. Reading the `stage` column instead would put every order in one bucket
 * at whatever stage it happens to be at today — which is what the board did
 * before, and why its old bars trended green with nothing but the passage of
 * time to explain it.
 *
 * Null means two different things, both of them "not our work then":
 *
 * - **Before the first event.** An order joins the board when it is
 *   confirmed, which is what its `ORDER_PLACED` event records. `poDate` is
 *   the date printed on the buyer's document and can be weeks earlier, so
 *   using it would show work in hand before anybody here had seen it.
 * - **Once delivered.** A delivered order is finished, so it drops off rather
 *   than accumulating for ever — the board counts what is in hand, not what
 *   has ever been ordered.
 *
 * An order carrying no events at all is also null. Every purchase order the
 * app writes gets an `ORDER_PLACED` event inside its own confirm transaction,
 * so this is the "we cannot know" case, and inventing a history from `poDate`
 * would be the very guess this function exists to remove.
 */
export function stageAt(events: StageMove[], end: Date): PoStage | null {
  let latest: Date | null = null;
  for (const event of events) {
    if (event.changedAt >= end) continue;
    if (!latest || event.changedAt > latest) latest = event.changedAt;
  }
  if (!latest) return null;

  const tied = events.filter(
    (event) => event.changedAt.getTime() === latest.getTime(),
  );
  if (tied.length === 1) return openOrNull(tied[0].toStage);

  // **Two events can share a timestamp**, and then their array order decides
  // nothing: Prisma's `orderBy changedAt` leaves ties in an arbitrary order
  // and the ids are not sortable by creation. So the chain answers it — the
  // last move of a tie is the one whose destination nobody else left from.
  // Measured on the seed, where clamping a lead time that runs past today
  // collapses several stages onto one instant: picking by array order put
  // one order in In warehouse that had already gone out for delivery.
  const departed = new Set(
    tied.map((event) => event.fromStage).filter(Boolean),
  );
  const last =
    tied.find((event) => !departed.has(event.toStage)) ?? tied[tied.length - 1];
  return openOrNull(last.toStage);
}

/**
 * Every order open at `end`, paired with the stage it stood at.
 *
 * One pass, returned as pairs rather than counted, because both the chart and
 * the table below it are built from the same list — a second walk could
 * disagree with the first.
 */
export function openAt<T extends StageOrder>(
  orders: T[],
  end: Date,
): { order: T; stage: PoStage }[] {
  const open: { order: T; stage: PoStage }[] = [];
  for (const order of orders) {
    const stage = stageAt(order.stageEvents, end);
    if (stage) open.push({ order, stage });
  }
  return open;
}

/**
 * One bar per snapshot: how many open orders stood at each stage when that
 * period ran out.
 *
 * `DELIVERED` is always zero — a delivered order has left the board — and the
 * card does not draw that segment. It stays in the shape so `StagePoint` is
 * one type across the app rather than two that drift.
 */
export function stageSnapshotSeries(
  orders: StageOrder[],
  snapshots: Snapshot[],
): StagePoint[] {
  return snapshots.map(({ key, label, end }) => {
    const point = { key, label, total: 0 } as StagePoint;
    for (const stage of PO_STAGES) point[stage] = 0;

    for (const { stage } of openAt(orders, end)) {
      point[stage] += 1;
      point.total += 1;
    }
    return point;
  });
}

/** All six stages with their counts at `end`, for the card's legend. */
export function stageSnapshotBreakdown(
  orders: StageOrder[],
  end: Date,
): StageBreakdown {
  const counts = new Map<PoStage, number>(PO_STAGES.map((s) => [s, 0]));
  for (const { stage } of openAt(orders, end)) {
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return PO_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
}
