/**
 * Narrowing the dashboard to a market, a brand or a category (Phase 53 §2).
 *
 * A market is a column on `Product`, not on `PurchaseOrder`, so one purchase
 * order can carry a Vietnam line and a Mydin line. There is no honest way to
 * put such an order's `total` in one market, which is why this narrows the
 * **lines**: with a filter on, every figure on the page counts only the lines
 * that match, and an order's money becomes the sum of its surviving lines.
 *
 * The alternative — keep matching orders whole — would let the markets sum to
 * more than the business earned, by exactly as much as its orders span
 * markets. That is the failure this module exists to prevent.
 *
 * Pure: no Prisma, no I/O.
 */

import { NO_MARKET } from "@/lib/product-markets";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

export type LineFilter = {
  /** A market's own name, or `NO_MARKET` for the products carrying none. */
  market?: string;
  brand?: string;
  category?: string;
};

/** Whether anything is actually being narrowed. */
export const isFiltered = (filter: LineFilter): boolean =>
  Boolean(filter.market || filter.brand || filter.category);

/**
 * Does this one line match?
 *
 * A line that matched no product at all carries null for all three, so it
 * matches no market, no brand and no category — it is not in a market called
 * nothing. `NO_MARKET` is how you ask for those products deliberately, and it
 * is the products with a null market, never the lines with no product.
 */
export function lineMatches(line: AnalyticsLineItem, filter: LineFilter): boolean {
  if (filter.market === NO_MARKET) {
    // A line with no product has no market *and no product*: it belongs in
    // the unattributed figure, not in the "No market" bucket, which is a
    // statement about real products somebody has to give a market to.
    if (line.productId === null || line.market !== null) return false;
  } else if (filter.market && line.market !== filter.market) {
    return false;
  }
  if (filter.brand && line.brand !== filter.brand) return false;
  if (filter.category && line.category !== filter.category) return false;
  return true;
}

/**
 * The orders, narrowed to their matching lines.
 *
 * With no filter this returns the input untouched — deliberately the same
 * array, so the unfiltered dashboard reports order totals exactly as it
 * always has, tax and acknowledged mismatches included. Only once something
 * is being narrowed does an order's total become its lines' sum, because that
 * is the only figure that can honestly be attributed.
 *
 * An order left with no matching lines is dropped rather than kept at zero: it
 * is not an order in this market, and counting it would put a zero in the
 * order count and drag the average down.
 */
export function filterOrders(
  orders: AnalyticsOrder[],
  filter: LineFilter,
): AnalyticsOrder[] {
  if (!isFiltered(filter)) return orders;

  const narrowed: AnalyticsOrder[] = [];
  for (const order of orders) {
    const lineItems = order.lineItems.filter((line) => lineMatches(line, filter));
    if (lineItems.length === 0) continue;
    narrowed.push({
      ...order,
      lineItems,
      total: lineItems.reduce((sum, line) => sum + line.amount, 0),
    });
  }
  return narrowed;
}

export type Attribution = {
  /** Every line's amount in the range, matched or not — the denominator. */
  lineTotal: number;
  /** Line value sitting in a real market. */
  inMarket: number;
  /** Line value on products that carry no market. */
  noMarket: number;
  /** Line value on lines that matched no product at all. */
  noProduct: number;
  /** `noMarket + noProduct` — what no market column can ever account for. */
  unattributed: number;
  /** Distinct markets with sales in the range. */
  marketCount: number;
};

/**
 * What the market figures can and cannot account for.
 *
 * The dashboard shows this wherever it shows money by market, because
 * `Σ(markets) ≤ Σ(lines)` always and the reader would otherwise take the
 * market columns for the whole business. Computed over the *unfiltered*
 * orders: it is a statement about the catalogue's completeness, and narrowing
 * to one market would make it say nothing.
 */
export function attribution(orders: AnalyticsOrder[]): Attribution {
  let lineTotal = 0;
  let inMarket = 0;
  let noMarket = 0;
  let noProduct = 0;
  const markets = new Set<string>();

  for (const order of orders) {
    for (const line of order.lineItems) {
      lineTotal += line.amount;
      if (line.productId === null) {
        noProduct += line.amount;
      } else if (line.market === null) {
        noMarket += line.amount;
      } else {
        inMarket += line.amount;
        markets.add(line.market);
      }
    }
  }

  // Cents, so two sums of the same figures in a different order print alike —
  // the rule `summarise` and `groupMarkets` already follow.
  const cents = (value: number) => Math.round(value * 100) / 100;
  return {
    lineTotal: cents(lineTotal),
    inMarket: cents(inMarket),
    noMarket: cents(noMarket),
    noProduct: cents(noProduct),
    unattributed: cents(noMarket + noProduct),
    marketCount: markets.size,
  };
}

/**
 * The filter the page will actually apply, given what the range holds.
 *
 * A value nothing in range carries is dropped rather than honoured. Honouring
 * it draws an empty board while the select still shows the value, which is
 * the defect this project keeps fixing — a filter the reader can neither see
 * working nor undo. `NO_MARKET` survives only while some line really sits on
 * a product carrying none.
 *
 * The caller echoes the result back to the toolbar, so a control can never
 * show a filter the page is not applying.
 */
export function resolveFilter(
  filter: LineFilter,
  available: { markets: string[]; brands: string[]; categories: string[]; hasNoMarket: boolean },
): LineFilter {
  const resolved: LineFilter = {};
  if (filter.market === NO_MARKET) {
    if (available.hasNoMarket) resolved.market = NO_MARKET;
  } else if (filter.market && available.markets.includes(filter.market)) {
    resolved.market = filter.market;
  }
  if (filter.brand && available.brands.includes(filter.brand)) resolved.brand = filter.brand;
  if (filter.category && available.categories.includes(filter.category)) {
    resolved.category = filter.category;
  }
  return resolved;
}

/** How the summary line names what is being counted. */
export function filterCaption(filter: LineFilter): string | null {
  const parts: string[] = [];
  if (filter.market) {
    parts.push(filter.market === NO_MARKET ? "products with no market" : filter.market);
  }
  if (filter.brand) parts.push(filter.brand);
  if (filter.category) parts.push(filter.category);
  if (parts.length === 0) return null;
  return `${parts.join(" · ")} only — every figure below counts only these lines.`;
}
