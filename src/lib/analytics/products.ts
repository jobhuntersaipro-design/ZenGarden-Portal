import { TZDate } from "@date-fns/tz";
import { endOfDay, startOfDay, subDays, subMonths } from "date-fns";
import { TIME_ZONE } from "@/lib/dates";
import { bucketKey, makeBuckets } from "@/lib/analytics/buckets";
import { shareBy, type ShareSlice } from "@/lib/analytics/share";

/**
 * The window. Exported once and passed to every caller so the KPI tiles, the
 * table, the footer summary and a product's order history cannot drift apart.
 *
 * The bug this exists to prevent was real: the order-history table had settled
 * on 367 days and the tiles above it on 365, and they disagreed by a couple of
 * orders — two numbers describing the same thing, able to differ.
 */
export function twelveMonthWindow(now: Date = new Date()) {
  const today = new TZDate(now, TIME_ZONE);
  return {
    from: startOfDay(subMonths(today, 12)) as Date,
    to: endOfDay(today) as Date,
  };
}

/** One row of a product's sales: a line item joined to its purchase order. */
export type ProductSaleRow = {
  purchaseOrderId: string;
  poNumber: string;
  poDate: Date;
  buyerId: string;
  buyerName: string;
  productId: string;
  quantity: number;
  amount: number;
};

export type ProductStats = {
  revenue: number;
  units: number;
  orders: number;
  buyers: number;
  unitsPerOrder: number;
  /** Mean billed unit price: amount ÷ quantity, so discounts count. */
  avgBilled: number;
  /** Percent below (negative) or above (positive) the current list price. */
  vsListPercent: number;
  /** First month's mean billed price to the last month's, as a percent. */
  driftPercent: number | null;
  /** Units per week over the last eight weeks. */
  velocity: number;
  /** Percent of purchase orders in the window that contained this product. */
  attachRate: number;
  firstSold: Date | null;
  lastSold: Date | null;
};

export function productStats(
  rows: ProductSaleRow[],
  listPrice: number,
  totalOrdersInWindow: number,
  window: { from: Date; to: Date },
  now: Date = new Date(),
): ProductStats {
  const revenue = rows.reduce((sum, row) => sum + row.amount, 0);
  const units = rows.reduce((sum, row) => sum + row.quantity, 0);
  const orders = new Set(rows.map((row) => row.purchaseOrderId)).size;
  const buyers = new Set(rows.map((row) => row.buyerId)).size;
  const avgBilled = units > 0 ? revenue / units : 0;

  const byMonth = new Map<string, { amount: number; quantity: number }>();
  for (const row of rows) {
    const key = bucketKey(row.poDate, "month");
    const entry = byMonth.get(key) ?? { amount: 0, quantity: 0 };
    entry.amount += row.amount;
    entry.quantity += row.quantity;
    byMonth.set(key, entry);
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthPrice = (entry: { amount: number; quantity: number }) =>
    entry.quantity > 0 ? entry.amount / entry.quantity : 0;

  // Drift needs two months with sales; one month is a price, not a movement.
  const driftPercent =
    months.length >= 2 && monthPrice(months[0][1]) > 0
      ? ((monthPrice(months[months.length - 1][1]) - monthPrice(months[0][1])) /
          monthPrice(months[0][1])) *
        100
      : null;

  const eightWeeksAgo = subDays(new TZDate(now, TIME_ZONE), 56);
  const recentUnits = rows
    .filter((row) => row.poDate >= eightWeeksAgo)
    .reduce((sum, row) => sum + row.quantity, 0);

  const dates = rows.map((row) => row.poDate);

  return {
    revenue,
    units,
    orders,
    buyers,
    unitsPerOrder: orders > 0 ? units / orders : 0,
    avgBilled,
    // Computed from the very figure it is printed beside, never a second
    // average taken somewhere else.
    vsListPercent: listPrice > 0 ? ((avgBilled - listPrice) / listPrice) * 100 : 0,
    driftPercent,
    velocity: recentUnits / 8,
    attachRate:
      totalOrdersInWindow > 0 ? (orders / totalOrdersInWindow) * 100 : 0,
    firstSold:
      dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null,
    lastSold: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null,
  };
}

export type PricePoint = {
  key: string;
  label: string;
  /** null for a month with no sales — a gap, not a zero. */
  avgBilled: number | null;
  units: number;
};

/**
 * Twelve monthly points. A month with no sales is `null` rather than 0: a zero
 * would draw the price collapsing to nothing, which is not what happened.
 */
export function priceTrend(
  rows: ProductSaleRow[],
  window: { from: Date; to: Date },
): PricePoint[] {
  const buckets = makeBuckets(window.from, window.to, "month");
  const byKey = new Map<string, { amount: number; quantity: number }>();

  for (const row of rows) {
    const key = bucketKey(row.poDate, "month");
    const entry = byKey.get(key) ?? { amount: 0, quantity: 0 };
    entry.amount += row.amount;
    entry.quantity += row.quantity;
    byKey.set(key, entry);
  }

  return buckets.map((bucket) => {
    const entry = byKey.get(bucket.key);
    return {
      key: bucket.key,
      label: bucket.label,
      avgBilled:
        entry && entry.quantity > 0 ? entry.amount / entry.quantity : null,
      units: entry?.quantity ?? 0,
    };
  });
}

export function whoBuysIt(rows: ProductSaleRow[]): ShareSlice[] {
  return shareBy(
    rows,
    (row) => ({ id: row.buyerId, label: row.buyerName }),
    (row) => row.amount,
  );
}

export type CoProduct = {
  productId: string;
  productName: string;
  orders: number;
  /** Percent of this product's orders that also contained the other one. */
  coOccurrence: number;
};

/**
 * The five products most often on the same purchase order. Measured against
 * *this* product's order count, so it reads as "when they buy this, they also
 * buy that N% of the time".
 */
export function boughtTogether(
  rows: ProductSaleRow[],
  allRows: ProductSaleRow[],
  productNames: Map<string, string>,
): CoProduct[] {
  const orderIds = new Set(rows.map((row) => row.purchaseOrderId));
  if (orderIds.size === 0) return [];
  const productId = rows[0]?.productId;

  const counts = new Map<string, Set<string>>();
  for (const row of allRows) {
    if (row.productId === productId) continue;
    if (!orderIds.has(row.purchaseOrderId)) continue;
    const set = counts.get(row.productId) ?? new Set<string>();
    set.add(row.purchaseOrderId);
    counts.set(row.productId, set);
  }

  return [...counts.entries()]
    .map(([id, set]) => ({
      productId: id,
      productName: productNames.get(id) ?? id,
      orders: set.size,
      coOccurrence: (set.size / orderIds.size) * 100,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);
}

export type AttentionFlag = "missing-image" | "inactive" | "not-sold-60d" | "price-moved";

export type ProductFlags = {
  productId: string;
  flags: AttentionFlag[];
};

const NOT_SOLD_DAYS = 60;
const PRICE_MOVED_PERCENT = 3;

/** The maintenance to-do list behind the quick-filter chips. */
export function needsAttention(
  products: { id: string; active: boolean; imageCount: number }[],
  statsById: Map<string, { lastSold: Date | null; driftPercent: number | null }>,
  now: Date = new Date(),
): ProductFlags[] {
  const cutoff = subDays(new TZDate(now, TIME_ZONE), NOT_SOLD_DAYS);

  return products.map((product) => {
    const stats = statsById.get(product.id);
    const flags: AttentionFlag[] = [];
    if (product.imageCount === 0) flags.push("missing-image");
    if (!product.active) flags.push("inactive");
    // Never sold counts as not sold: there is nothing more to wait for.
    if (!stats?.lastSold || stats.lastSold < cutoff) flags.push("not-sold-60d");
    if (
      stats?.driftPercent !== null &&
      stats?.driftPercent !== undefined &&
      Math.abs(stats.driftPercent) > PRICE_MOVED_PERCENT
    ) {
      flags.push("price-moved");
    }
    return { productId: product.id, flags };
  });
}
