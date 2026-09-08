/**
 * The fixed catalogue: one entry per kind of product the customer actually
 * makes, taken from their inventory master list (ZEN GARDEN DC INVENTORY
 * 2026). A free-text category would fragment into "Shower cream", "shower
 * cream" and "S/C" inside a week, and every share chart would then be wrong in
 * a way nobody notices — which is also why this list stays hardcoded while
 * brand, variant and market grow by typing.
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
   * category. A real member of this list rather than free text: the whole
   * point of the fixed list is that categories cannot fragment.
   */
  "Uncategorised",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const isProductCategory = (value: string): value is ProductCategory =>
  (PRODUCT_CATEGORIES as readonly string[]).includes(value);
