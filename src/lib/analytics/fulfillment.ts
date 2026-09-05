import { PoStage } from "@/generated/prisma/enums";
import type { Aggregation } from "@/lib/dates";
import { PO_STAGES } from "@/lib/po-stages";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import type { AnalyticsOrder } from "@/lib/analytics/types";

export type StagePoint = {
  key: string;
  label: string;
  total: number;
} & Record<PoStage, number>;

const emptyStages = () =>
  Object.fromEntries(PO_STAGES.map((stage) => [stage, 0])) as Record<
    PoStage,
    number
  >;

/**
 * Per bucket, how many of that bucket's confirmed orders sit in each stage
 * *today* — not the stage they were in at the time. "Where each period's
 * orders stand now" is the question this chart answers.
 */
export function stageSeries(
  orders: AnalyticsOrder[],
  from: Date,
  to: Date,
  agg: Aggregation,
): StagePoint[] {
  const buckets = makeBuckets(from, to, agg);
  const byKey = new Map<string, StagePoint>(
    buckets.map((bucket) => [
      bucket.key,
      { key: bucket.key, label: bucket.label, total: 0, ...emptyStages() },
    ]),
  );

  for (const order of orders) {
    const point = byKey.get(bucketKey(order.poDate, agg));
    if (!point) continue;
    point[order.stage] += 1;
    point.total += 1;
  }

  return buckets.map((bucket) => byKey.get(bucket.key)!);
}

export type StageBreakdown = { stage: PoStage; count: number }[];

/** All six stages, always, even at zero — the funnel has a shape either way. */
export function stageBreakdown(orders: AnalyticsOrder[]): StageBreakdown {
  const counts = emptyStages();
  for (const order of orders) counts[order.stage] += 1;
  return PO_STAGES.map((stage) => ({ stage, count: counts[stage] }));
}

export type OpenPipeline = {
  openCount: number;
  openValue: number;
  /** Mean days from the ORDER_PLACED event to the DELIVERED event. */
  averageDaysToDeliver: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function openPipeline(orders: AnalyticsOrder[]): OpenPipeline {
  const open = orders.filter((order) => order.stage !== PoStage.DELIVERED);

  const durations: number[] = [];
  for (const order of orders) {
    // Only orders that actually reached Delivered can time the journey; an
    // order still in flight would drag the average toward zero.
    const placed = order.stageEvents.find(
      (event) => event.toStage === PoStage.ORDER_PLACED,
    );
    const delivered = order.stageEvents.find(
      (event) => event.toStage === PoStage.DELIVERED,
    );
    if (!placed || !delivered) continue;
    const days =
      (delivered.changedAt.getTime() - placed.changedAt.getTime()) / DAY_MS;
    if (days >= 0) durations.push(days);
  }

  return {
    openCount: open.length,
    openValue: open.reduce((sum, order) => sum + order.total, 0),
    averageDaysToDeliver:
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : null,
  };
}
