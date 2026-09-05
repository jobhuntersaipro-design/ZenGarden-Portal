import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import type { AnalyticsOrder } from "@/lib/analytics/types";

/**
 * Monthly totals across the range, for the roster's 60×24 sparkline. Monthly
 * regardless of the page's aggregation: the cell is 60px wide, and a year of
 * daily points in that space is a smudge, not a trend.
 */
export function monthlyTotals(
  orders: AnalyticsOrder[],
  from: Date,
  to: Date,
): number[] {
  const buckets = makeBuckets(from, to, "month");
  const byKey = new Map(buckets.map((bucket) => [bucket.key, 0]));

  for (const order of orders) {
    const key = bucketKey(order.poDate, "month");
    if (!byKey.has(key)) continue;
    byKey.set(key, byKey.get(key)! + order.total);
  }

  return buckets.map((bucket) => byKey.get(bucket.key)!);
}
