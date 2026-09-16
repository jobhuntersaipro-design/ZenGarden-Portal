import { z } from "zod";
import { Prisma } from "@/generated/prisma/browser";
import { productFamilySchema } from "@/lib/validation/product-families";

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

export const decimalString = z
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
export const growingLabel = (limit: number) =>
  z
    .string()
    .max(limit, `Use at most ${limit} characters`)
    .nullable()
    .transform((value) => value?.trim() || null);

/**
 * A count of whole things — pieces per carton, cartons per pallet. Arrives as
 * a string from a text field or as a number from an import, and either way
 * must be a whole number above zero: "1.5 per carton" is a typo, not a pack.
 */
const wholeCount = (noun: string) => z
  .union([z.number(), z.string(), z.null()])
  .transform((value, ctx) => {
    if (value === null || value === "") return null;
    const number = typeof value === "number" ? value : Number(value.trim());
    if (!Number.isInteger(number) || number <= 0) {
      ctx.addIssue({
        code: "custom",
        message: `${noun} must be a whole number above zero`,
      });
      return z.NEVER;
    }
    return number;
  });

/**
 * The shape without its cross-field rule, so a caller that needs a different
 * arrangement of the same fields can `omit` and `extend` it — Phase 39's batch
 * create keeps the shared half and moves `sku`, `listPrice` and `variant` into
 * a per-variant row. Refinements do not survive `omit`, so the rule below is
 * restated there rather than inherited.
 */
export const productObject = z.object({
  name: z.string().min(1, "A name is required").max(120),
  sku: skuSchema,
  /**
   * A growing label like brand and market, seeded by `PRODUCT_CATEGORIES` —
   * a closed enum until Phase 27. Required, unlike its siblings: every
   * product is some kind of thing, and the share charts group by this.
   */
  category: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "A category is required")
    .refine((value) => value.length <= 56, "Use at most 56 characters"),
  unit: z.string().min(1, "A unit is required").max(24),
  listPrice: decimalString,
  /** ZEN GARDEN, MR. KING, L.HANDS — the name on the bottle. */
  brand: growingLabel(40),
  /** Goat's Milk, Lavender, Lemon — the fragrance or formulation. */
  variant: growingLabel(40),
  packSize: wholeCount("Pack size"),
  /** "60CTNS/PALLET", as the customer's own labels and sheet print it. */
  cartonsPerPallet: wholeCount("Cartons per pallet"),
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
  /**
   * The family this product is a variant of (Phase 36) — an existing one by
   * id, or a new one described inline and created in the same transaction.
   * Both nullable, never optional, like the labels above: a product with no
   * family is a state the listing shows, not a key a caller may forget.
   */
  familyId: z.string().nullable(),
  newFamily: productFamilySchema.nullable(),
});

export const FAMILY_XOR_MESSAGE =
  "Choose an existing family or describe a new one, not both";

export const productSchema = productObject.refine(
  (value) => !(value.familyId && value.newFamily),
  { message: FAMILY_XOR_MESSAGE, path: ["familyId"] },
);

export type ProductInput = z.input<typeof productSchema>;
export type ProductParsed = z.output<typeof productSchema>;
