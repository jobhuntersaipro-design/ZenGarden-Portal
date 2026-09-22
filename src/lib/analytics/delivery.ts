/**
 * Did we deliver this market on time? (Phase 53 §4.4)
 *
 * The one figure on the dashboard that does **not** narrow to lines, and the
 * reason is the whole design. On time is a property of the order: the whole
 * document arrived late, or it did not. So a market's rate is over the orders
 * that carry at least one line in it, and an order spanning Vietnam and Mydin
 * counts in both — it let both of them down.
 *
 * Counting one order twice would inflate a *sum*, which is exactly what §2.1
 * refuses to do with money. This is a **rate**, and a rate has no total to
 * inflate: the columns are not meant to add up, and the caption says whose
 * orders each one is over so nobody tries.
 *
 * Pure: no Prisma, no I/O.
 */

import { TZDate } from "@date-fns/tz";
import { PoStage } from "@/generated/prisma/enums";
import { TIME_ZONE } from "@/lib/dates";
import type { AnalyticsOrder } from "@/lib/analytics/types";

export type MarketDelivery = {
  market: string;
  /** Delivered orders touching this market that carried an expected date. */
  delivered: number;
  onTime: number;
  /** Percent, or null where nothing delivered — `—`, never a 0% that lies. */
  rate: number | null;
};

export type DeliveryPerformance = {
  rows: MarketDelivery[];
  /** Delivered orders left out for carrying no expected delivery date. */
  undated: number;
  /** Delivered orders counted, across all markets — distinct, not summed. */
  counted: number;
};

/** The calendar day in Kuala Lumpur, as `YYYY-MM-DD`, for an honest compare. */
const dayKL = (value: Date): string =>
  new TZDate(value, TIME_ZONE).toISOString().slice(0, 10);

/**
 * When the order reached DELIVERED — the *first* time it did.
 *
 * An order moved back and then forward again was still first delivered on the
 * earlier date; taking the last event would forgive a late delivery whenever
 * somebody corrected a stage afterwards.
 */
function deliveredAt(order: AnalyticsOrder): Date | null {
  let earliest: Date | null = null;
  for (const event of order.stageEvents) {
    if (event.toStage !== PoStage.DELIVERED) continue;
    if (earliest === null || event.changedAt < earliest) earliest = event.changedAt;
  }
  return earliest;
}

/**
 * On-time delivery per market, over the orders in range.
 *
 * What it refuses to report, deliberately:
 *
 * - **An order with no expected delivery date** has nothing to be late
 *   against, so it is in neither the numerator nor the denominator. It is
 *   counted in `undated` instead, because silently dropping it would make a
 *   catalogue of undated orders look like a perfect record.
 * - **An order not yet delivered** is not late here even if its date has
 *   passed. That is the demand board's Overdue column's job, and two screens
 *   disagreeing about what "late" means is worse than one screen not saying.
 * - **A market with nothing delivered** gets `rate: null`, printed as `—`.
 *   A 0% would read as "we never deliver on time" rather than "no data".
 */
export function deliveryByMarket(orders: AnalyticsOrder[]): DeliveryPerformance {
  const byMarket = new Map<string, { delivered: number; onTime: number }>();
  let undated = 0;
  const countedOrders = new Set<string>();

  for (const order of orders) {
    if (order.stage !== PoStage.DELIVERED) continue;
    const at = deliveredAt(order);
    if (at === null) continue;

    if (order.deliveryDate === null) {
      undated += 1;
      continue;
    }

    const markets = new Set<string>();
    for (const line of order.lineItems) {
      if (line.market) markets.add(line.market);
    }
    if (markets.size === 0) continue;

    const punctual = dayKL(at) <= dayKL(order.deliveryDate);
    countedOrders.add(order.id);
    for (const market of markets) {
      const entry = byMarket.get(market) ?? { delivered: 0, onTime: 0 };
      entry.delivered += 1;
      if (punctual) entry.onTime += 1;
      byMarket.set(market, entry);
    }
  }

  const rows = [...byMarket.entries()]
    .map(([market, entry]) => ({
      market,
      delivered: entry.delivered,
      onTime: entry.onTime,
      rate: entry.delivered > 0 ? (entry.onTime / entry.delivered) * 100 : null,
    }))
    // Worst first: this card is read to find where the problem is.
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || b.delivered - a.delivered);

  return { rows, undated, counted: countedOrders.size };
}
