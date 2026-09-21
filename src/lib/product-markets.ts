/**
 * The catalog by market.
 *
 * A market is where a product is sold — its destination or its retail
 * customer, never its country of origin (`context/project-overview.md`). The
 * catalog could already *filter* by one; this makes it a set of rows, so the
 * question "how is Vietnam doing, and what is broken in it" is answered by
 * reading down a column rather than by choosing each market in turn and
 * remembering what the last one said.
 *
 * It is the mirror of `groupFamilies`: a family is one product across its
 * markets, a market is many products in one place. Both sum their figures
 * from the same sale rows the product rows use, so a market's revenue is
 * exactly its products' revenue added up.
 *
 * Pure: no Prisma, no I/O.
 */

/**
 * The `?market=` value meaning "products carrying no market".
 *
 * Not the plain `none` that `NO_FAMILY` uses, because these two sentinels sit
 * against different things. A family id is a cuid, which nobody can type by
 * hand; a market is free text the team enters into a growing list, where
 * `none` is a plausible thing to write and `*none` is not.
 */
export const NO_MARKET = "*none";

/** What the remainder row is called, in the one place it is spelled. */
export const NO_MARKET_LABEL = "No market";

export type MarketRow = {
  /** The market's own name, or `NO_MARKET` for the remainder row. */
  id: string;
  name: string;
  products: number;
  active: number;
  /** Products in the market carrying at least one attention flag. */
  toFix: number;
  /** How many brands are sold into it — the reciprocal of a family's markets. */
  brands: number;
  units: number;
  revenue: number;
  orders: number;
  buyers: number;
};

export const MARKET_SORT_KEYS = [
  "name",
  "products",
  "units",
  "revenue",
  "buyers",
  "status",
] as const;

export type MarketSortKey = (typeof MARKET_SORT_KEYS)[number];

type MarketMember = {
  id: string;
  market: string | null;
  brand: string | null;
  active: boolean;
  flags: readonly string[];
};

type SaleRow = { purchaseOrderId: string; buyerId: string; quantity: number; amount: number };

/**
 * One row per market from the products already fetched for the catalog.
 *
 * Distinct orders and buyers are counted across the market rather than summed
 * per product, because two of a market's products on one purchase order is
 * one order and one buyer — summing would report a market as busier than it
 * is, by exactly as much as its products are bought together.
 *
 * Products carrying no market become one last row, so they stay countable and
 * reachable from here. That row is the whole point of the view for
 * maintenance: a product with no market is invisible to every market question
 * asked of the catalogue until somebody gives it one.
 */
export function groupMarkets<P extends MarketMember>(
  products: P[],
  rowsByProduct: Map<string, SaleRow[]>,
): MarketRow[] {
  const groups = new Map<
    string,
    { row: MarketRow; orders: Set<string>; buyers: Set<string>; brands: Set<string> }
  >();

  for (const product of products) {
    const key = product.market ?? NO_MARKET;
    let group = groups.get(key);
    if (!group) {
      group = {
        row: {
          id: key,
          name: product.market ?? NO_MARKET_LABEL,
          products: 0,
          active: 0,
          toFix: 0,
          brands: 0,
          units: 0,
          revenue: 0,
          orders: 0,
          buyers: 0,
        },
        orders: new Set(),
        buyers: new Set(),
        brands: new Set(),
      };
      groups.set(key, group);
    }
    group.row.products += 1;
    if (product.active) group.row.active += 1;
    if (product.flags.length > 0) group.row.toFix += 1;
    // A product carrying no brand is not in a brand called nothing, so it is
    // not counted as one — unlike a family's market count, where the shop
    // draws a "No market" section and the column has to agree with it.
    if (product.brand) group.brands.add(product.brand);
    for (const sale of rowsByProduct.get(product.id) ?? []) {
      group.row.units += sale.quantity;
      group.row.revenue += sale.amount;
      group.orders.add(sale.purchaseOrderId);
      group.buyers.add(sale.buyerId);
    }
  }

  const rows = [...groups.values()].map((group) => ({
    ...group.row,
    // Cents, for the same reason `summarise` rounds: two sums of the same
    // figures in a different order must print identically.
    revenue: Math.round(group.row.revenue * 100) / 100,
    brands: group.brands.size,
    orders: group.orders.size,
    buyers: group.buyers.size,
  }));
  // The remainder row last, whatever the sort — it is not a market.
  return rows.sort((a, b) => Number(a.id === NO_MARKET) - Number(b.id === NO_MARKET));
}

/**
 * Searching and sorting the market rows, after the stats exist.
 *
 * Brand and category are deliberately not taken. A market row spans both by
 * construction, so those controls could only mean "count just this brand's
 * products inside each market" — narrowing what a row *counts* where the same
 * two selects narrow which *rows show* on the family view. One control with
 * two meanings is worse than one control that is absent, which is the same
 * call the market select itself makes on family rows.
 */
export function selectMarkets(
  markets: MarketRow[],
  { q, sort }: { q?: string; sort: { key: MarketSortKey; dir: "asc" | "desc" } },
): MarketRow[] {
  const needle = q?.trim().toLowerCase();
  const filtered = markets.filter((market) => {
    // The remainder row is matched on the words it actually prints, so
    // searching "no market" finds it and searching a real market does not.
    if (needle && !market.name.toLowerCase().includes(needle)) return false;
    return true;
  });

  const value = (market: MarketRow): number | string => {
    switch (sort.key) {
      case "name":
        return market.name.toLowerCase();
      case "products":
        return market.products;
      case "units":
        return market.units;
      case "revenue":
        return market.revenue;
      case "buyers":
        return market.buyers;
      case "status":
        // Most in need of attention first.
        return market.toFix;
    }
  };

  const remainder = filtered.filter((row) => row.id === NO_MARKET);
  const sorted = filtered
    .filter((row) => row.id !== NO_MARKET)
    .sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return sort.dir === "asc" ? comparison : -comparison;
    });
  return [...sorted, ...remainder];
}
