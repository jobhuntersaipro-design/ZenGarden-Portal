import type { Aggregation } from "@/lib/dates";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import type { AnalyticsOrder } from "@/lib/analytics/types";

export type SalesPoint = {
  key: string;
  label: string;
  total: number;
  count: number;
  /** Line-item quantities summed — the "Quantity" measure of the sales card. */
  units: number;
};

export type SalesSeries = {
  points: SalesPoint[];
  total: number;
  count: number;
  units: number;
  average: number;
  /** Over buckets that had sales — an empty Sunday is not "the minimum". */
  max: SalesPoint | null;
  min: SalesPoint | null;
};

export type SalesMeasure = "sales" | "units";

export type MeasurePoint = { key: string; label: string; value: number; count: number };

/** One measure of the series, in the shape the line chart draws. */
export type MeasureSeries = {
  measure: SalesMeasure;
  points: MeasurePoint[];
  total: number;
  count: number;
  average: number;
  max: MeasurePoint | null;
  min: MeasurePoint | null;
};

/**
 * Sales or units, on the same buckets and the same rules: the average is over
 * every bucket, the extremes over buckets that had orders. Money in, units
 * out — the chart never sees both, so it never draws two scales.
 */
export function pickMeasure(series: SalesSeries, measure: SalesMeasure): MeasureSeries {
  const points = series.points.map((point) => ({
    key: point.key,
    label: point.label,
    value: measure === "sales" ? point.total : point.units,
    count: point.count,
  }));
  const total = measure === "sales" ? series.total : series.units;
  const withOrders = points.filter((point) => point.count > 0);
  const max =
    withOrders.length > 0
      ? withOrders.reduce((best, point) => (point.value > best.value ? point : best))
      : null;
  const min =
    withOrders.length > 0
      ? withOrders.reduce((best, point) => (point.value < best.value ? point : best))
      : null;
  return {
    measure,
    points,
    total,
    count: series.count,
    average: points.length > 0 ? total / points.length : 0,
    max,
    min,
  };
}

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
      { key: bucket.key, label: bucket.label, total: 0, count: 0, units: 0 },
    ]),
  );

  for (const order of orders) {
    const point = byKey.get(bucketKey(order.poDate, agg));
    // An order outside the buckets is an order outside the range; ignore it
    // rather than inventing a bucket the axis does not have.
    if (!point) continue;
    point.total += order.total;
    point.count += 1;
    point.units += order.lineItems.reduce((sum, line) => sum + line.quantity, 0);
  }

  const points = buckets.map((bucket) => byKey.get(bucket.key)!);
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const count = points.reduce((sum, point) => sum + point.count, 0);
  const units = points.reduce((sum, point) => sum + point.units, 0);

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

  return { points, total, count, units, average, max, min };
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
