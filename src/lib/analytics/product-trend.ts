import type { Aggregation } from "@/lib/dates";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import type { AnalyticsOrder } from "@/lib/analytics/types";

/** One row per bucket; each selected product id is a key on it. */
export type ProductTrendPoint = { key: string; label: string } & Record<
  string,
  string | number
>;

/**
 * Units per bucket per product, over the same buckets as every other chart on
 * the page — empty buckets included, so a quiet month is visibly quiet.
 */
export function unitsPerBucket(
  orders: AnalyticsOrder[],
  productIds: string[],
  from: Date,
  to: Date,
  agg: Aggregation,
): ProductTrendPoint[] {
  const buckets = makeBuckets(from, to, agg);
  const zero = Object.fromEntries(productIds.map((id) => [id, 0]));
  const byKey = new Map<string, ProductTrendPoint>(
    buckets.map((bucket) => [
      bucket.key,
      { key: bucket.key, label: bucket.label, ...zero },
    ]),
  );

  const wanted = new Set(productIds);
  for (const order of orders) {
    const point = byKey.get(bucketKey(order.poDate, agg));
    if (!point) continue;
    for (const line of order.lineItems) {
      if (!line.productId || !wanted.has(line.productId)) continue;
      point[line.productId] = (point[line.productId] as number) + line.quantity;
    }
  }

  return buckets.map((bucket) => byKey.get(bucket.key)!);
}
