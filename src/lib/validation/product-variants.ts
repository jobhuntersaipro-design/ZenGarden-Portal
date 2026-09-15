import { z } from "zod";
import {
  FAMILY_XOR_MESSAGE,
  decimalString,
  growingLabel,
  productObject,
  skuSchema,
} from "@/lib/validation/products";

/**
 * Creating a product and all of its flavours in one submit (Phase 39).
 *
 * A variant is a `Product` row of its own, as it has been since Phase 31, so
 * this schema is `productSchema`'s shared half plus a row per variant carrying
 * the three things that genuinely differ: the flavour, its code and its price.
 * Everything else — brand, category, pack size, cartons per pallet, unit,
 * market, description, family, active — is entered once and applied to every
 * row, which is also what keeps them in one group: `groupKey` keys on family,
 * pack size and market, so variants that disagree on those would draw separate
 * cards.
 *
 * Two rules beyond the field-level ones:
 *
 * - **a SKU repeated inside the batch is named**, because Postgres would answer
 *   the same collision with a P2002 that cannot say which pair collided. The
 *   check runs on the *parsed* codes, so two spellings of one code
 *   (`zen-sc-2100-pp` and `ZEN-SC-2100-PP`) are caught — `skuSchema`
 *   upper-cases and collapses whitespace before this sees them;
 * - **two or more variants require a family.** With one row a family stays
 *   optional, exactly as it is today. With two, the family is what guarantees
 *   the shop draws one card instead of relying on `groupKey`'s derived
 *   brand-and-name fallback matching two hand-typed names.
 *
 * The refinements are declared in the order their messages should win, because
 * the action reports `issues[0]` alone.
 */
export const MAX_VARIANT_ROWS = 24;

export const variantRowSchema = z.object({
  /** Goat's Milk, Lavender, Papaya — null for a product with no flavour. */
  variant: growingLabel(40),
  sku: skuSchema,
  listPrice: decimalString,
});

export const productVariantsSchema = productObject
  .omit({ sku: true, listPrice: true, variant: true })
  .extend({
    variants: z
      .array(variantRowSchema)
      .min(1, "Add at least one variant")
      .max(MAX_VARIANT_ROWS, `Use at most ${MAX_VARIANT_ROWS} variants at a time`),
  })
  .refine((value) => !(value.familyId && value.newFamily), {
    message: FAMILY_XOR_MESSAGE,
    path: ["familyId"],
  })
  .refine(
    (value) => value.variants.length < 2 || Boolean(value.familyId || value.newFamily),
    {
      message:
        "Two or more variants need a family, so the shop shows them as one product.",
      path: ["familyId"],
    },
  )
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, variant] of value.variants.entries()) {
      if (seen.has(variant.sku)) {
        ctx.addIssue({
          code: "custom",
          message: `Two variants carry the SKU ${variant.sku}. Every variant needs its own.`,
          path: ["variants", index, "sku"],
        });
        continue;
      }
      seen.add(variant.sku);
    }
  });

export type ProductVariantsInput = z.input<typeof productVariantsSchema>;
export type ProductVariantsParsed = z.output<typeof productVariantsSchema>;
