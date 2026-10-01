import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";

/**
 * Purchase orders per Kuala Lumpur calendar day over the year ending `now`,
 * oldest first, one entry per day — empty days included, so the heatmap draws
 * a quiet week as a quiet week rather than skipping it.
 */
export function ordersPerDay(
  orders: { poDate: Date }[],
  now: Date,
): { date: string; count: number }[] {
  const from = new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000);
  const days = makeBuckets(from, now, "day");
  const counts = new Map(days.map((day) => [day.key, 0]));
  for (const order of orders) {
    const key = bucketKey(order.poDate, "day");
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return days.map((day) => ({ date: day.key, count: counts.get(day.key)! }));
}
