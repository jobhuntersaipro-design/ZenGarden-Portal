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

export const productSchema = z.object({
  name: z.string().min(1, "A name is required").max(120),
  sku: skuSchema,
  category: z.enum(PRODUCT_CATEGORIES),
  unit: z.string().min(1, "A unit is required").max(24),
  listPrice: decimalString,
  description: z
    .string()
    .nullable()
    .transform((value) => value?.trim() || null),
  active: z.boolean(),
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductParsed = z.output<typeof productSchema>;
