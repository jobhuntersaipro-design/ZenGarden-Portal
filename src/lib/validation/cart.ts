import { z } from "zod";

/**
 * A sane ceiling per line. Not a business rule — the customer has none — but a
 * line reading 900,000 cartons is a typo or an attack, and either way the ops
 * team should not have to notice it at review.
 */
export const MAX_CARTONS_PER_LINE = 9999;

export const cartonsSchema = z
  .number()
  .int("Whole cartons only")
  .positive("Order at least one carton")
  .max(MAX_CARTONS_PER_LINE, `That is more than ${MAX_CARTONS_PER_LINE} cartons`);

export const addToCartSchema = z.object({
  productId: z.string().min(1),
  cartons: cartonsSchema,
});

export const setCartonsSchema = addToCartSchema;

/** A guest basket past this is not a wholesale order, it is a script. */
export const MAX_GUEST_LINES = 100;

export const guestCartLinesSchema = z
  .array(z.object({ productId: z.string().min(1).max(64), cartons: cartonsSchema }))
  .max(MAX_GUEST_LINES);

export const submitOrderSchema = z.object({
  buyerReference: z.string().max(64).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;
