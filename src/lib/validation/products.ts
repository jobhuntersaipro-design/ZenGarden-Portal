import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import { Prisma } from "@/generated/prisma/browser";

/**
 * SKUs are typed, read aloud and matched against documents, so the shape is
 * pinned: upper-case letters, digits and dashes. Anything else and two people
 * enter the "same" SKU two ways.
 */
export const skuSchema = z
  .string()
  .min(1, "A SKU is required")
  .max(32, "Use at most 32 characters")
  .regex(/^[A-Z0-9-]+$/, "Use capitals, digits and dashes only");

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
