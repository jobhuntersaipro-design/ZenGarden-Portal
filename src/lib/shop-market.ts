import type { Prisma } from "@/generated/prisma/client";

/**
 * Who the shop is being drawn for, and therefore which products exist for
 * them. Resolved once per request from the signed-in contact's own buyer
 * (`loadShopViewer`) and threaded down; never re-derived in a component.
 *
 * There are only two cases, and that is the point:
 *
 * - `scoped` — their buyer carries a market, so they see the products
 *   carrying that same market and no others.
 * - `unassigned` — they are signed in but nobody has given their buyer a
 *   market. They see **nothing**, and every shop surface says so in words.
 *
 * There is deliberately no third case for a guest: a guest cannot reach a
 * shop page at all (the storefront layout redirects to sign-in), so "not
 * signed in" never becomes "sees the whole catalogue" by omission.
 */
export type ShopAudience =
  | { kind: "scoped"; market: string }
  | { kind: "unassigned" };

export function shopAudience(market: string | null | undefined): ShopAudience {
  // Whitespace is not a market. A buyer whose market was saved as "" would
  // otherwise scope to products whose market is "", which is a population
  // nothing can join and a silent way to get an empty shop with no
  // explanation on screen.
  const trimmed = market?.trim();
  return trimmed ? { kind: "scoped", market: trimmed } : { kind: "unassigned" };
}

/**
 * The predicate every shop-facing read of `Product` must carry.
 *
 * It takes the market as a **required string** rather than reading a
 * constant, and that signature is the enforcement: a call site that has not
 * resolved an audience cannot call this, so `tsc` finds every place that
 * would have to decide what an unscoped viewer sees. The Phase 53 lesson —
 * adding a column to a shared type turned nine files red, which is the
 * evidence no caller was left guessing — applied to a visibility rule.
 *
 * `market` is matched exactly, not case-insensitively. Both sides come from
 * the same `CatalogLabel` vocabulary of kind MARKET, which already refuses
 * two spellings of one value (`renameLabel`), so a case-insensitive match
 * here would only ever paper over a value written by a script rather than
 * chosen from the list — and quietly widen who can see a product.
 *
 * A product carrying **no** market matches nobody. That is the user's own
 * rule (2026-09-23) and it is why this is a plain equality rather than an
 * `OR` with `{ market: null }`: an unmarketed product is not a general
 * product, it is one nobody has finished setting up.
 */
export function shopVisible(market: string): Prisma.ProductWhereInput {
  return {
    active: true,
    needsReview: false,
    listPrice: { gt: 0 },
    market,
  };
}

/**
 * The same rule, for the surfaces that show a product a buyer has already
 * ordered rather than one they may order now.
 *
 * A past order's lines are the buyer's own record and stay readable whatever
 * the catalogue does afterwards — an order placed before their market moved,
 * or for a product since withdrawn, must not vanish from their history. So
 * this is NOT applied to `loadBuyerOrder` or to the purchase-order document;
 * it exists to be named in a comment at those call sites rather than left as
 * an omission somebody later reads as a bug.
 */
export const ORDER_HISTORY_IS_NOT_SCOPED =
  "A past order is the buyer's own record and is not re-filtered by market.";
