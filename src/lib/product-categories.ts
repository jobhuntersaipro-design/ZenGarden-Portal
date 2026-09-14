/**
 * The seed vocabulary: one entry per kind of product the customer actually
 * makes, taken from their inventory master list (ZEN GARDEN DC INVENTORY
 * 2026). Since Phase 28 the live list lives in `CatalogLabel`, and this array
 * is what a new database is born knowing — read by the migration's backfill
 * and by `prisma/seed.ts`, not by any screen.
 *
 * This was a *closed* list until Phase 27, on the reasoning that a free-text
 * category fragments into "Shower cream", "shower cream" and "S/C" inside a
 * week and every share chart is then quietly wrong. Half of that still holds
 * and is the reason the list is seeded rather than empty; the other half was
 * bought out by the cost it imposed — nobody could record a new kind of
 * product without a deploy. A category is now a growing label like brand,
 * variant and market: `Combobox` matches case-insensitively, so a list cannot
 * fork on casing, but a genuine synonym will split a chart slice and no code
 * can tell that it is wrong.
 */
export const PRODUCT_CATEGORIES = [
  "Shower cream & gel",
  "Hand wash & soap",
  "Hair care",
  "Body care",
  "Hand sanitizer",
  "Dishwash & cleanser",
  "Laundry detergent",
  "Fragrance",
  /**
   * Auto-created from a purchase order code, where the document gives no
   * category. A real member of this list rather than free text: a product the
   * portal invented should say so in the one word every such product shares.
   */
  "Uncategorised",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const isProductCategory = (value: string): value is ProductCategory =>
  (PRODUCT_CATEGORIES as readonly string[]).includes(value);
