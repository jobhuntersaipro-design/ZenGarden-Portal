import type { AnalyticsOrder } from "@/lib/analytics/types";

/** Fewer purchases than this and an "interval" is noise, not a rhythm. */
const MIN_PURCHASES = 4;
/** How far either side of the due date counts as "due now". */
const DUE_WINDOW_DAYS = 7;
const TOP_N = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReorderBadge = "overdue" | "due-now" | "due";

export type ReorderSignal = {
  productId: string;
  productName: string;
  purchases: number;
  /** Mean days between this buyer's purchases of this product. */
  intervalDays: number;
  lastPurchase: Date;
  dueAt: Date;
  /** Negative until the due date, positive once past it. */
  daysPastDue: number;
  badge: ReorderBadge;
};

export type ReorderSignals = {
  signals: ReorderSignal[];
  /** Items already past their interval — the roster's Overdue column. */
  overdueCount: number;
};

/**
 * When a buyer is likely to want each product again, from how often they have
 * bought it before.
 *
 * Only products bought at least four times get a signal: with two or three
 * purchases the mean interval is as much an accident of timing as a rhythm,
 * and a prediction nobody can act on is worse than none.
 *
 * Full history, never the page's range — this is a claim about the buyer's
 * cadence, and a range that happens to be short would invent urgency.
 */
export function reorderSignals(
  history: AnalyticsOrder[],
  now: Date = new Date(),
): ReorderSignals {
  const byProduct = new Map<string, { name: string; dates: Date[] }>();

  for (const order of history) {
    for (const line of order.lineItems) {
      if (!line.productId) continue;
      const entry = byProduct.get(line.productId) ?? {
        name: line.productName ?? line.productId,
        dates: [],
      };
      entry.dates.push(order.poDate);
      byProduct.set(line.productId, entry);
    }
  }

  const signals: ReorderSignal[] = [];

  for (const [productId, entry] of byProduct) {
    if (entry.dates.length < MIN_PURCHASES) continue;

    const sorted = [...entry.dates].sort((a, b) => a.getTime() - b.getTime());
    let gapSum = 0;
    for (let index = 1; index < sorted.length; index += 1) {
      gapSum += (sorted[index].getTime() - sorted[index - 1].getTime()) / DAY_MS;
    }
    const intervalDays = gapSum / (sorted.length - 1);
    if (intervalDays <= 0) continue;

    const lastPurchase = sorted[sorted.length - 1];
    const dueAt = new Date(lastPurchase.getTime() + intervalDays * DAY_MS);
    const daysPastDue = (now.getTime() - dueAt.getTime()) / DAY_MS;

    const badge: ReorderBadge =
      daysPastDue > DUE_WINDOW_DAYS
        ? "overdue"
        : daysPastDue >= -DUE_WINDOW_DAYS
          ? "due-now"
          : "due";

    signals.push({
      productId,
      productName: entry.name,
      purchases: sorted.length,
      intervalDays,
      lastPurchase,
      dueAt,
      daysPastDue,
      badge,
    });
  }

  // Most pressing first: furthest past due, then soonest due.
  signals.sort((a, b) => b.daysPastDue - a.daysPastDue);

  return {
    signals: signals.slice(0, TOP_N),
    // Counts everything past its interval, not just the five shown.
    overdueCount: signals.filter((signal) => signal.badge === "overdue").length,
  };
}
