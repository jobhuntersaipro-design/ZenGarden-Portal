/**
 * The fixed catalogue, matching what `prisma/seed.ts` produces. A free-text
 * category would fragment into "Stone", "stone" and "Stones" inside a week,
 * and every share chart would then be wrong in a way nobody notices.
 */
export const PRODUCT_CATEGORIES = [
  "Stone",
  "Plants",
  "Decking",
  "Furniture",
  "Water",
  "Screens & fencing",
  "Structures",
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
