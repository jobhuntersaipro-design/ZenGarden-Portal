import { PoStage } from "@/generated/prisma/enums";
import { PO_STAGES } from "@/lib/po-stages";
import type { StagePoint } from "@/lib/analytics/fulfillment";

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
  id: string;
  stageEvents: StageMove[];
  lineItems: { productId: string | null; productName: string | null }[];
  /**
   * The date we committed to, as a calendar day (`yyyy-MM-dd`) rather than a
   * `Date`. `PurchaseOrder.deliveryDate` is `@db.Date`, so it *is* a calendar
   * day, and comparing it as a string against a bucket's own day keeps the
   * whole overdue rule out of reach of the timezone trap this project has
   * been bitten by twice — a raw timestamp truncates to a **UTC** date and
   * admits an extra day.
   *
   * Null is not a zero: nobody committed to a date, so the order can never be
   * overdue, and it is not counted as on time either.
   */
  deliveryDate: string | null;
};

/** A bucket, the instant its period runs out, and the last day inside it. */
export type Snapshot = {
  key: string;
  label: string;
  end: Date;
  /**
   * The bucket's own last calendar day, which is what "overdue then" is
   * measured against. At daily grain it is the key; at a coarser one it is
   * the last day of the period, because a promise for the 3rd is not broken
   * until the week holding it has run out.
   */
  day: string;
};

/**
 * Was this order already past its expected delivery date when `day` ran out?
 *
 * **Measured at the day being read, never at today.** The board replays
 * history, so a bar for 15 Sep has to say what was late *on 15 Sep*; reading
 * today's lateness onto a past bar is the same defect the board was rebuilt
 * to remove, and it would make every bar in the window trend red purely
 * because time had passed.
 *
 * Strictly before: an order expected on the 15th is not late at the end of
 * the 15th. That matches the demand board's own `due today`, which is not
 * lateness, and it is the reading that does not round in our favour.
 */
export const isOverdueAt = (order: StageOrder, day: string): boolean =>
  order.deliveryDate !== null && order.deliveryDate < day;

/** Which open orders a board is about: everything, or only the late ones. */
export type StageShow = "all" | "overdue";

/**
 * A bar, with the late share of each of its stages.
 *
 * The two live on one datum rather than in two parallel series because the
 * chart draws each stage as a solid band and a hatched one, and a second
 * lookup is a second thing that can disagree with the first.
 */
export type StageSplitPoint = StagePoint & {
  /** The bucket's own last calendar day — what "N days late" is measured to. */
  day: string;
  late: Record<PoStage, number>;
  lateTotal: number;
};

/** One legend row: the stage, its orders, and how many of them are late. */
export type StageSplitRow = { stage: PoStage; count: number; late: number };
export type StageSplitBreakdown = StageSplitRow[];

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
  at: Snapshot,
  show: StageShow = "all",
): { order: T; stage: PoStage; overdue: boolean }[] {
  const open: { order: T; stage: PoStage; overdue: boolean }[] = [];
  for (const order of orders) {
    const stage = stageAt(order.stageEvents, at.end);
    if (!stage) continue;
    const overdue = isOverdueAt(order, at.day);
    // The filter is applied here and nowhere else on purpose: the series, the
    // legend and the table all walk this one function, so narrowing to the
    // late orders cannot leave one of them counting a different population.
    if (show === "overdue" && !overdue) continue;
    open.push({ order, stage, overdue });
  }
  return open;
}

/**
 * One bar per snapshot: how many open orders stood at each stage when that
 * period ran out, and how many of each stage's were already late.
 *
 * `DELIVERED` is always zero — a delivered order has left the board — and the
 * card does not draw that segment. It stays in the shape so `StagePoint` is
 * one type across the app rather than two that drift.
 *
 * `stageSnapshotBreakdown` used to sit beside this and count the same orders
 * a second time for the legend. It is gone: the legend reads the last bar
 * through `pointBreakdown`, so the two cannot drift — which is exactly the
 * defect `context/lessons.md` §1 records.
 */
export function stageSnapshotSeries(
  orders: StageOrder[],
  snapshots: Snapshot[],
  show: StageShow = "all",
): StageSplitPoint[] {
  return snapshots.map((snapshot) => {
    const point = {
      key: snapshot.key,
      label: snapshot.label,
      day: snapshot.day,
      total: 0,
      late: {} as Record<PoStage, number>,
      lateTotal: 0,
    } as StageSplitPoint;
    for (const stage of PO_STAGES) {
      point[stage] = 0;
      point.late[stage] = 0;
    }

    for (const { stage, overdue } of openAt(orders, snapshot, show)) {
      point[stage] += 1;
      point.total += 1;
      if (overdue) {
        point.late[stage] += 1;
        point.lateTotal += 1;
      }
    }
    return point;
  });
}

/**
 * A bar's own legend: the counts the chart has just drawn for that bucket,
 * each with the share of it that was already late.
 *
 * It exists so the legend under the chart and the bar above it cannot come
 * from two different reads. Delivered is left out, as it is everywhere on
 * this board — an order leaves the day it is delivered, so its segment, its
 * legend row and its column would all be pinned at zero.
 */
export function pointBreakdown(point: StageSplitPoint): StageSplitBreakdown {
  return PO_STAGES.filter((stage) => stage !== PoStage.DELIVERED).map(
    (stage) => ({ stage, count: point[stage], late: point.late[stage] }),
  );
}
