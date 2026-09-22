/**
 * Each market's share now against the period before it (Phase 53 §4.2).
 *
 * The donut says what the mix *is*; this says which way it is moving, which
 * is the question a donut cannot answer however many times you look at it.
 *
 * Share is of the money that could be attributed to a market — not of total
 * sales — because the unattributed value has no market to take share from.
 * The card names that denominator so the percentages are readable as what
 * they are.
 *
 * Pure: no Prisma, no I/O.
 */

import type { AnalyticsOrder } from "@/lib/analytics/types";

export type MarketMixRow = {
  market: string;
  value: number;
  /** Percent of this period's attributed value, 0-100. */
  share: number;
  priorValue: number;
  priorShare: number;
  /**
   * Change in share, in percentage points. Null where the market had no sales
   * at all last period: arriving from nothing is not a share that moved, and
   * printing "+12pp" for it reads as growth against a base that never existed.
   */
  deltaShare: number | null;
  /** True where this market sold nothing in the prior period. */
  isNew: boolean;
  /** True where it sold nothing in this one but did before. */
  isGone: boolean;
};

export type MarketMix = {
  rows: MarketMixRow[];
  /** This period's attributed value — the denominator the shares are of. */
  total: number;
  priorTotal: number;
};

const cents = (value: number) => Math.round(value * 100) / 100;

function byMarket(orders: AnalyticsOrder[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lineItems) {
      if (!line.market) continue;
      totals.set(line.market, (totals.get(line.market) ?? 0) + line.amount);
    }
  }
  return totals;
}

/**
 * One row per market that sold in either period, ranked by this period's
 * value. A market that has gone quiet keeps its row at zero rather than
 * disappearing — its absence is the finding.
 */
export function marketMix(
  orders: AnalyticsOrder[],
  prior: AnalyticsOrder[],
): MarketMix {
  const now = byMarket(orders);
  const before = byMarket(prior);

  const total = [...now.values()].reduce((sum, value) => sum + value, 0);
  const priorTotal = [...before.values()].reduce((sum, value) => sum + value, 0);

  const markets = new Set([...now.keys(), ...before.keys()]);
  const rows: MarketMixRow[] = [...markets].map((market) => {
    const value = now.get(market) ?? 0;
    const priorValue = before.get(market) ?? 0;
    const share = total > 0 ? (value / total) * 100 : 0;
    const priorShare = priorTotal > 0 ? (priorValue / priorTotal) * 100 : 0;
    return {
      market,
      value: cents(value),
      share,
      priorValue: cents(priorValue),
      priorShare,
      deltaShare: priorValue > 0 ? share - priorShare : null,
      isNew: priorValue === 0 && value > 0,
      isGone: value === 0 && priorValue > 0,
    };
  });

  return {
    rows: rows.sort((a, b) => b.value - a.value || a.market.localeCompare(b.market)),
    total: cents(total),
    priorTotal: cents(priorTotal),
  };
}
