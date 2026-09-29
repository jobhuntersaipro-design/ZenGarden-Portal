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

/**
 * Why a typed carton count cannot be added, or null when it can (S-01). The
 * product page and the catalogue card read it before Add to cart, so an empty
 * box or a 0 disables the button with a reason instead of adding something
 * other than what the box shows.
 */
export function cartonsProblem(cartons: number): string | null {
  if (!Number.isInteger(cartons) || cartons < 1) return "Enter at least 1 carton.";
  if (cartons > MAX_CARTONS_PER_LINE) {
    return `Up to ${MAX_CARTONS_PER_LINE.toLocaleString("en-MY")} cartons at a time.`;
  }
  return null;
}

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

/**
 * Several lines in one action (Phase 39). `max` is the guest cap, which is a
 * ceiling on any one batch too: a request past it is a script, not a buyer
 * choosing flavours.
 */
export const addManyToCartSchema = z.object({
  lines: z
    .array(addToCartSchema)
    .min(1, "Choose a quantity for at least one variant")
    .max(MAX_GUEST_LINES),
});

/** The message the form shows under the field and the server answers with. */
export const PO_NUMBER_REQUIRED = "Enter your PO number.";

export const submitOrderSchema = z.object({
  /**
   * Required since 2026-09-20, at the customer's request: every order placed
   * on the shop carries the buyer's own PO number. `trim()` runs before
   * `min(1)`, so whitespace alone is refused rather than stored.
   *
   * `WebOrder.buyerReference` stays nullable regardless — a DRAFT cart exists
   * long before this form is reached, and orders placed while the field was
   * optional still hold null.
   */
  buyerReference: z.string().trim().min(1, PO_NUMBER_REQUIRED).max(64),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/**
 * What the review screen keeps on the open cart while it is typed into
 * (S-29, 2026-09-29), so a reload or a trip back to the cart does not empty
 * it. Blank is allowed here — the PO number is required at send, not while
 * it is still being typed.
 */
export const checkoutDraftSchema = z.object({
  buyerReference: z.string().trim().max(64),
  notes: z.string().trim().max(2000),
});

export type CheckoutDraftInput = z.infer<typeof checkoutDraftSchema>;

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;
