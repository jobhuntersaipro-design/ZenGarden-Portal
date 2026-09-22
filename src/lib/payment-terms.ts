import { z } from "zod";

/**
 * Payment terms are a whole number of days, zero or more (2026-09-22).
 *
 * The column stays `String?` on both `Buyer` and `PurchaseOrder`, and what is
 * stored stays human-readable — `"30 days"` — so every screen, the emails and
 * both purchase-order renderers print it exactly as they always have, and no
 * migration puts the values already on production at risk. The number is the
 * thing that is validated; the wording is how it is kept.
 *
 * **Legacy values are read, not rejected.** `parsePaymentTermsDays` takes the
 * first whole number out of whatever is stored, so `"30 days"`, `"30"` and
 * `"Net 30"` all open in a form as `30`. A value with no number in it at all
 * reads as null, and the field opens empty — the reviewer has to say what the
 * terms are rather than the form inventing them.
 *
 * **What this rules out is worth stating:** a purchase order whose printed
 * terms are "COD", "Cash on delivery" or "50% deposit" can no longer be
 * recorded as written. Those are real terms on real documents, and Claude's
 * extraction reads whatever the page says, so a reviewer will meet this. The
 * constraint was asked for; the cost is here rather than discovered later.
 */
const LEADING_NUMBER = /\d+/;

export function parsePaymentTermsDays(stored: string | null | undefined): number | null {
  const match = stored?.match(LEADING_NUMBER);
  if (!match) return null;
  const days = Number(match[0]);
  return Number.isSafeInteger(days) && days >= 0 ? days : null;
}

/** What a form's number input shows for a stored value: "30 days" → "30". */
export const paymentTermsDaysInput = (stored: string | null | undefined): string => {
  const days = parsePaymentTermsDays(stored);
  return days === null ? "" : String(days);
};

/** What is written to the database, and what every screen prints. */
export function formatPaymentTerms(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export const PAYMENT_TERMS_MESSAGE =
  "Payment terms are a whole number of days, 0 or more.";

/**
 * The server's own check, on every path that writes the field — the buyer
 * form, the buyer patch, the purchase-order edit sheet, a scan's confirm and
 * a shop order's confirm. A number input is a hint; this is the rule.
 *
 * Takes what a form sends (a string), refuses anything that is not digits,
 * and returns the canonical wording or null for an empty field.
 */
const DAYS = /^\d+$/;

/** Shared by both schemas below. Refuses, or returns the canonical wording. */
function toStored(raw: string | null, ctx: z.RefinementCtx): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return null;
  if (!DAYS.test(trimmed)) {
    ctx.addIssue(PAYMENT_TERMS_MESSAGE);
    return z.NEVER as never;
  }
  return formatPaymentTerms(Number(trimmed));
}

/**
 * Creating, and a scan's confirm draft: a field that is absent or empty means
 * no terms, and reads as null so the column is written null rather than left
 * to a default.
 */
export const paymentTermsSchema = z
  .string()
  .nullish()
  .transform((value, ctx) => toStored(value ?? null, ctx));

/**
 * Where the key may be absent — every patch. `undefined` is passed straight
 * through rather than read as an empty field, or a patch naming only the
 * remark would clear the terms. That is the Phase 23 defect, and it is why
 * this mirrors `emptyToNull` rather than being written afresh.
 */
export const optionalPaymentTermsSchema = z
  .string()
  .nullable()
  .optional()
  .transform((value, ctx) =>
    value === undefined ? undefined : toStored(value, ctx),
  );
