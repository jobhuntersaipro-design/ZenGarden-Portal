import { NO_MARKET, NO_MARKET_LABEL } from "@/lib/product-markets";

/**
 * Filtering a roster of buyers by the market they buy in.
 *
 * Shared by both buyer tables — the management roster (`/admin/buyers`) and
 * the analytics roster (`/buyers`) — because a market means one thing and a
 * filter that found a buyer on one screen and not the other would be one
 * control with two meanings, the same argument `boardHaystack` settled for
 * the two demand boards.
 *
 * Pure: no Prisma, no I/O, so a client component can import it without
 * dragging the adapter into the browser bundle (see
 * `admin-buyer-labels.ts`'s own note on why that matters here).
 *
 * `NO_MARKET` is reused rather than a second sentinel invented: it is
 * already what `/products?market=*none` means, and on a buyer roster it is
 * the worklist this whole feature creates — every buyer nobody has assigned
 * a market to has an empty shop until somebody does.
 */
export { NO_MARKET, NO_MARKET_LABEL };

export type BuyerMarketFilter = string | null;

/** A buyer row, reduced to the one field this filter reads. */
export type MarketBearing = { market: string | null };

/**
 * Does this buyer match the chosen market?
 *
 * `null` (no filter) matches every row — that is "All markets", which is the
 * absence of a parameter rather than a value. `NO_MARKET` matches exactly
 * the buyers carrying none, which is the only way to ask for them: a blank
 * option would be indistinguishable from "All".
 */
export function matchesMarket(row: MarketBearing, filter: BuyerMarketFilter): boolean {
  if (filter === null) return true;
  if (filter === NO_MARKET) return row.market === null;
  return row.market === filter;
}

/**
 * The markets to offer, read off the rows themselves rather than from the
 * `CatalogLabel` table.
 *
 * Deriving them from the roster is what stops the control offering a market
 * that would match nothing — the same rule the product toolbar's own market
 * select follows. The cost is the mirror of it: a market that exists in the
 * vocabulary but that no buyer is in yet is not offered here, which is
 * correct for a *filter* and would be wrong for the picker on the buyer
 * form, where the whole vocabulary is what you are choosing from.
 */
export function buyerMarketOptions(rows: MarketBearing[]): {
  markets: string[];
  hasNoMarket: boolean;
} {
  const markets = new Set<string>();
  let hasNoMarket = false;
  for (const row of rows) {
    if (row.market === null) hasNoMarket = true;
    else markets.add(row.market);
  }
  return {
    markets: [...markets].sort((a, b) => a.localeCompare(b)),
    hasNoMarket,
  };
}

/**
 * Read a `?market=` parameter into a filter, dropping a value nothing in
 * range carries.
 *
 * A stale link naming a market no buyer is in any more would otherwise draw
 * an empty board with the select still showing it — the defect
 * `resolveFilter` was written for on the dashboard (Phase 53). Dropping it
 * here means the select and the rows can never disagree about what is being
 * shown.
 */
export function resolveBuyerMarket(
  raw: string | undefined,
  rows: MarketBearing[],
): BuyerMarketFilter {
  if (!raw) return null;
  const { markets, hasNoMarket } = buyerMarketOptions(rows);
  if (raw === NO_MARKET) return hasNoMarket ? NO_MARKET : null;
  return markets.includes(raw) ? raw : null;
}
