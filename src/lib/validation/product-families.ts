import { z } from "zod";

/**
 * A family code is the first segments of a variant's SKU — `ZEN-SC-2100`,
 * `ZEN-SC-1000-SCRUB` — so it keeps the SKU's discipline: one case, no
 * padding, and only what a SKU may hold. Shorter than a SKU, because a
 * variant has to fit after it inside the SKU's 32.
 */
const FAMILY_CODE_SHAPE = /^[A-Z0-9]([A-Z0-9 ._/+-]*[A-Z0-9])?$/;

export const normaliseFamilyCode = (value: string) =>
  value.trim().replace(/\s+/g, " ").toUpperCase();

export const familyCodeSchema = z
  .string()
  .transform(normaliseFamilyCode)
  .refine((value) => value.length > 0, "A family code is required")
  .refine((value) => value.length <= 24, "Use at most 24 characters")
  .refine(
    (value) => FAMILY_CODE_SHAPE.test(value),
    "Use capitals, digits and - . _ / +",
  );

const optionalText = (limit: number) =>
  z
    .string()
    .max(limit, `Use at most ${limit} characters`)
    .nullable()
    .transform((value) => value?.trim() || null);

export const productFamilySchema = z.object({
  code: familyCodeSchema,
  name: z.string().trim().min(1, "A family needs a name").max(120),
  brand: optionalText(40),
  category: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "A category is required")
    .refine((value) => value.length <= 56, "Use at most 56 characters"),
  /** "2.1L", "500ML" — as `sizeCode` reads it; null for a sizeless line. */
  size: optionalText(16).transform((value) =>
    value ? value.replace(/\s+/g, "").toUpperCase() : null,
  ),
});

export type ProductFamilyInput = z.input<typeof productFamilySchema>;
export type ProductFamilyParsed = z.output<typeof productFamilySchema>;
