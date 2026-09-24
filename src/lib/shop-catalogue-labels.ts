import type { ShopCatalogueQuery } from "@/lib/shop-filters";

/**
 * The catalogue's heading and count line (§5.3, reworded in Phase 58).
 *
 * A search names itself: `Results for "lavender"` rather than "All products"
 * over a grid that is not all products. And an empty result says the search
 * or filters matched nothing — "Nothing yet" describes a shop with no stock,
 * which is a different thing to tell a buyer who has simply mistyped.
 */
export function catalogueHeading(query: Pick<ShopCatalogueQuery, "q" | "category">): string {
  if (query.q) return `Results for "${query.q}"`;
  return query.category ?? "All products";
}

/** Whether the reader has narrowed the grid beyond the category they opened. */
export function isNarrowed(
  query: Pick<ShopCatalogueQuery, "q" | "brands" | "packSizes" | "markets">,
): boolean {
  return (
    Boolean(query.q) ||
    query.brands.length > 0 ||
    query.packSizes.length > 0 ||
    query.markets.length > 0
  );
}

/** "48 products · showing 1–24" / "1 product" / "No products match" / "Nothing yet".
 * Phase 31: the figure counts cards, so a product sold in eight flavours is
 * one product here, which is what the reader is looking at. */
export function resultLabel(total: number, from: number, to: number, narrowed: boolean): string {
  if (total === 0) return narrowed ? "No products match" : "Nothing yet";
  if (total === 1) return "1 product";
  return `${total} products · showing ${from}–${to}`;
}
