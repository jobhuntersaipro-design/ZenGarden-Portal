import { z } from "zod";
// The browser entry, not `client`. This module runs on both sides — the totals
// gate is enforced in the Server Action and mirrored in the review form — and
// `@/generated/prisma/client` drags PrismaClient (and `node:module`) into the
// bundle. `browser` exposes the same `Decimal` with none of the server runtime.
import { Prisma } from "@/generated/prisma/browser";

/**
 * Money crosses this boundary as a string and is compared as a Decimal. A
 * float would make the totals gate lie: 0.1 + 0.2 !== 0.3 is exactly the kind
 * of difference the gate exists to catch (00-master.md §4).
 */
const decimalString = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((value) => {
      try {
        new Prisma.Decimal(value);
        return true;
      } catch {
        return false;
      }
    }, `${label} must be a number`);

/**
 * A calendar day, not an instant. Exported since Phase 38 so `stages.ts` and
 * this module cannot drift on what a date looks like — they had a copy each.
 */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

export const PRODUCT_DECISIONS = ["unset", "linked", "new", "none"] as const;
export type ProductDecision = (typeof PRODUCT_DECISIONS)[number];

/**
 * Split from the exported schema so the object stays a `ZodObject` — a
 * `.superRefine` returns a checked schema that no longer offers `.extend`
 * or `.shape`.
 */
const DraftLineItemFields = z.object({
  /**
   * The product code as printed on the document, stored on the line and shown
   * on the PO detail screen. Since Phase 12 it no longer *decides* the link:
   * `productDecision` does. Editing it re-ranks the suggestions, nothing more.
   */
  sku: z.string().nullable(),
  description: z.string().min(1, "Describe the line"),
  productId: z.string().nullable().optional(),
  quantity: decimalString("Quantity"),
  unit: z.string().nullable(),
  unitPrice: decimalString("Unit price"),
  amount: decimalString("Amount"),
  /** True once the reviewer types an amount by hand; stops the recompute. */
  amountManual: z.boolean().optional(),
  /**
   * What the reviewer decided this line is. "unset" blocks Confirm — the
   * whole point of the field is that a person looked. Defaulted rather than
   * required so drafts written before this phase parse as undecided, which
   * is exactly right: they were never reviewed under this rule.
   */
  productDecision: z.enum(PRODUCT_DECISIONS).default("unset"),
});

export const DraftLineItemSchema = DraftLineItemFields.superRefine(
  (line, ctx) => {
    if (line.productDecision === "linked" && !line.productId) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a product for every line",
        path: ["productId"],
      });
    }
  },
);

/**
 * The reviewer's working copy. Either an existing buyer is chosen or a new one
 * is named — never both, never neither.
 */
const draftBuyerChosen = {
  check: (draft: { buyerId?: string | null; newBuyerName?: string | null }) =>
    Boolean(draft.buyerId) || Boolean(draft.newBuyerName),
  message: { message: "Choose a buyer", path: ["buyerId"] },
};

const draftObject = z.object({
    poNumber: z.string().min(1, "PO number is required"),

    buyerId: z.string().nullable().optional(),
    newBuyerName: z.string().min(1).nullable().optional(),
    poDate: isoDate,
    currency: z.string().min(1).default("MYR"),
    paymentTerms: z.string().nullable(),
    notes: z.string().nullable().optional(),
    lineItems: z.array(DraftLineItemSchema).min(1, "Add at least one line"),
    subtotal: decimalString("Subtotal"),
    tax: decimalString("Tax"),
    /** As printed on the document. Never recomputed — the gate compares to it. */
    total: decimalString("Total"),
  });

export const PoDraftSchema = draftObject.refine(
  draftBuyerChosen.check,
  draftBuyerChosen.message,
);

/**
 * The same draft for confirming an order placed on the shop, which has no PO
 * number to type: the buyer's own is on the order (`buyerReference`) and the
 * Order ID is never one (2026-09-17). `confirmWebOrder` blanks whatever is
 * sent, so this only has to accept the blank.
 */
export const WebOrderDraftSchema = draftObject
  .extend({ poNumber: z.string() })
  .refine(draftBuyerChosen.check, draftBuyerChosen.message);

export type PoDraft = z.infer<typeof PoDraftSchema>;
export type DraftLineItem = z.infer<typeof DraftLineItemSchema>;

export const confirmOptionsSchema = z.object({
  revisedOf: z.string().nullable().optional(),
  totalsAcknowledged: z.boolean().optional(),
});

/**
 * What confirming a **shop** order needs on top (Phase 38): the day the team
 * commits to delivering.
 *
 * Deliberately not part of `PoDraftSchema` or of `confirmOptionsSchema`
 * itself. A purchase order read off a customer's scan may carry no delivery
 * date at all, and `confirmPurchaseOrder` must keep confirming without one;
 * an order placed on the shop is a promise the team is making, and the buyer
 * is told the date by email the moment it is made. Requiring it here and
 * nowhere else is what keeps those two true at once.
 */
export const webOrderConfirmOptionsSchema = confirmOptionsSchema.extend({
  deliveryDate: isoDate,
});

const decimalOrZero = (value: string | null | undefined) => {
  if (!value) return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(value);
  } catch {
    return new Prisma.Decimal(0);
  }
};

export type TotalsCheck = {
  computed: string;
  document: string;
  difference: string;
  matches: boolean;
  /** Line-item sum vs subtotal — a hint in the guidance line, not the gate. */
  lineItemSum: string;
  lineItemsMatchSubtotal: boolean;
};

/**
 * The gate: **computed `subtotal + tax` against the total printed on the
 * document**, at 2 dp.
 *
 * Deliberately not the line-item sum against the document total — that
 * comparison ignores tax and fails every PO that has any, which is the wrong
 * test (docs/specs/04-extraction-review.md §3). The line-item sum is computed
 * here too, but only as the hint shown in the banner's guidance line.
 */
export function checkTotals(draft: {
  subtotal: string;
  tax: string;
  total: string;
  lineItems: { amount: string }[];
}): TotalsCheck {
  const subtotal = decimalOrZero(draft.subtotal);
  const tax = decimalOrZero(draft.tax);
  const documentTotal = decimalOrZero(draft.total);

  const computed = subtotal.plus(tax).toFixed(2);
  const document = documentTotal.toFixed(2);
  const difference = decimalOrZero(computed).minus(document).toFixed(2);

  const lineItemSum = draft.lineItems
    .reduce((sum, line) => sum.plus(decimalOrZero(line.amount)), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    computed,
    document,
    difference,
    matches: computed === document,
    lineItemSum,
    lineItemsMatchSubtotal: lineItemSum === subtotal.toFixed(2),
  };
}

/** `amount = quantity × unitPrice`, at the 2 dp line items are stored in. */
export function lineAmount(quantity: string, unitPrice: string): string {
  return decimalOrZero(quantity).times(decimalOrZero(unitPrice)).toFixed(2);
}

/**
 * Deleting is confirmed by typing the order's identifier back — its Order ID,
 * or the PO number for a scan, which has none — the same shape as
 * `deleteUser`'s email check in Phase 09. The comparison itself lives in the
 * action, so it can be trimmed and case-insensitive against the real value.
 */
export const deletePurchaseOrderSchema = z.object({
  id: z.string().min(1),
  typedReference: z.string().min(1),
});

/**
 * Asked for whenever the expected delivery date moves, and refused without —
 * by the edit sheet before it sends, and by `updatePurchaseOrder` after.
 *
 * Here rather than beside the action: a `"use server"` file may export
 * nothing but async functions, so a constant shared with the form has to live
 * outside it.
 */
export const REASON_REQUIRED = "Say why the expected delivery date is moving.";
