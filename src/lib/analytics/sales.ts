import type { Aggregation } from "@/lib/dates";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import type { AnalyticsOrder } from "@/lib/analytics/types";

export type SalesPoint = {
  key: string;
  label: string;
  total: number;
  count: number;
};

export type SalesSeries = {
  points: SalesPoint[];
  total: number;
  count: number;
  average: number;
  /** Over buckets that had sales — an empty Sunday is not "the minimum". */
  max: SalesPoint | null;
  min: SalesPoint | null;
};

export function salesSeries(
  orders: AnalyticsOrder[],
  from: Date,
  to: Date,
  agg: Aggregation,
): SalesSeries {
  const buckets = makeBuckets(from, to, agg);
  const byKey = new Map<string, SalesPoint>(
    buckets.map((bucket) => [
      bucket.key,
      { key: bucket.key, label: bucket.label, total: 0, count: 0 },
    ]),
  );

  for (const order of orders) {
    const point = byKey.get(bucketKey(order.poDate, agg));
    // An order outside the buckets is an order outside the range; ignore it
    // rather than inventing a bucket the axis does not have.
    if (!point) continue;
    point.total += order.total;
    point.count += 1;
  }

  const points = buckets.map((bucket) => byKey.get(bucket.key)!);
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const count = points.reduce((sum, point) => sum + point.count, 0);

  // The average is per bucket across the whole range, empty ones included:
  // "RM 41,430.93 per day" means per day, not per day-that-had-sales.
  const average = points.length > 0 ? total / points.length : 0;

  const withSales = points.filter((point) => point.count > 0);
  const max =
    withSales.length > 0
      ? withSales.reduce((best, point) => (point.total > best.total ? point : best))
      : null;
  const min =
    withSales.length > 0
      ? withSales.reduce((best, point) => (point.total < best.total ? point : best))
      : null;

  return { points, total, count, average, max, min };
}

export type Kpis = {
  totalSales: number;
  orderCount: number;
  averageOrder: number;
  topBuyer: { id: string; name: string; total: number; share: number } | null;
  /** Percent change against the previous period, or null when there is none. */
  deltaPercent: number | null;
};

export function kpis(
  orders: AnalyticsOrder[],
  previous: AnalyticsOrder[],
): Kpis {
  const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
  const orderCount = orders.length;

  const byBuyer = new Map<string, { id: string; name: string; total: number }>();
  for (const order of orders) {
    const entry = byBuyer.get(order.buyerId) ?? {
      id: order.buyerId,
      name: order.buyerName,
      total: 0,
    };
    entry.total += order.total;
    byBuyer.set(order.buyerId, entry);
  }

  const top = [...byBuyer.values()].sort((a, b) => b.total - a.total)[0] ?? null;
  const previousTotal = previous.reduce((sum, order) => sum + order.total, 0);

  return {
    totalSales,
    orderCount,
    averageOrder: orderCount > 0 ? totalSales / orderCount : 0,
    topBuyer: top
      ? {
          ...top,
          share: totalSales > 0 ? (top.total / totalSales) * 100 : 0,
        }
      : null,
    // A previous period with no sales gives no meaningful percentage: every
    // change from zero is infinite.
    deltaPercent:
      previousTotal > 0 ? ((totalSales - previousTotal) / previousTotal) * 100 : null,
  };
}
