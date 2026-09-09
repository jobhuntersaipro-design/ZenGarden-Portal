import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { Prisma } from "@/generated/prisma/browser";

/**
 * A SKU is the product code as printed on a customer's purchase order — it is
 * matched against documents, so it has to be able to hold what documents
 * actually print. Capitals, digits and dashes was too narrow a guess: real
 * orders carry `ZEN/SC/2100/CARROT`, `ZENSC-R.JELLY2LT` and `KE218441 68216`,
 * and because `resolveProducts` writes a line's code straight to the database
 * a product could exist that this very schema refused to save (2026-09-09).
 *
 * The discipline that mattered is kept: one case, and whitespace normalised,
 * so the same code cannot enter the catalogue two ways. A code carrying
 * something outside this set still needs editing by hand — rarer than the
 * slashes and spaces that were actually breaking.
 */
const SKU_SHAPE = /^[A-Z0-9]([A-Z0-9 ._/+-]*[A-Z0-9])?$/;

/** Upper-cased and space-collapsed — applied wherever a SKU is stored or looked up. */
export const normaliseSku = (value: string) =>
  value.trim().replace(/\s+/g, " ").toUpperCase();

export const skuSchema = z
  .string()
  .transform(normaliseSku)
  .refine((value) => value.length > 0, "A SKU is required")
  .refine((value) => value.length <= 32, "Use at most 32 characters")
  .refine(
    (value) => SKU_SHAPE.test(value),
    "Use capitals, digits and - . _ / +",
  );

const decimalString = z
  .string()
  .min(1, "A list price is required")
  .refine((value) => {
    try {
      return new Prisma.Decimal(value).greaterThan(0);
    } catch {
      return false;
    }
  }, "The list price must be a number above zero");

/**
 * A label that grows by typing — brand, variant, market. Nullable, never
 * optional: the form always sends the key, so a call site that forgets it
 * fails to typecheck rather than silently clearing a value somebody entered.
 * Trimmed to null because the pickers are built from the values stored here
 * (`listMarkets()` and its siblings), and a blank or padded one would show up
 * in the list as something you can choose.
 */
const growingLabel = (limit: number) =>
  z
    .string()
    .max(limit, `Use at most ${limit} characters`)
    .nullable()
    .transform((value) => value?.trim() || null);

/**
 * Pieces per carton. Arrives as a string from a text field or as a number from
 * an import, and either way must be a whole number above zero — "1.5 per
 * carton" is a typo, not a pack.
 */
const packSize = z
  .union([z.number(), z.string(), z.null()])
  .transform((value, ctx) => {
    if (value === null || value === "") return null;
    const number = typeof value === "number" ? value : Number(value.trim());
    if (!Number.isInteger(number) || number <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Pack size must be a whole number above zero",
      });
      return z.NEVER;
    }
    return number;
  });

export const productSchema = z.object({
  name: z.string().min(1, "A name is required").max(120),
  sku: skuSchema,
  category: z.enum(PRODUCT_CATEGORIES),
  unit: z.string().min(1, "A unit is required").max(24),
  listPrice: decimalString,
  /** ZEN GARDEN, MR. KING, L.HANDS — the name on the bottle. */
  brand: growingLabel(40),
  /** Goat's Milk, Lavender, Lemon — the fragrance or formulation. */
  variant: growingLabel(40),
  packSize,
  /**
   * The market a formulation is made for — a country (Vietnam, India) or a
   * customer (Mydin, Hero Market), which is how the ops team's own sheet
   * labels its product blocks.
   */
  market: growingLabel(56),
  description: z
    .string()
    .nullable()
    .transform((value) => value?.trim() || null),
  active: z.boolean(),
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductParsed = z.output<typeof productSchema>;
