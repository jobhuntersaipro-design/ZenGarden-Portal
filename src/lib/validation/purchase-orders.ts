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

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

export const DraftLineItemSchema = z.object({
  description: z.string().min(1, "Describe the line"),
  productId: z.string().nullable().optional(),
  quantity: decimalString("Quantity"),
  unit: z.string().nullable(),
  unitPrice: decimalString("Unit price"),
  amount: decimalString("Amount"),
  /** True once the reviewer types an amount by hand; stops the recompute. */
  amountManual: z.boolean().optional(),
});

/**
 * The reviewer's working copy. Either an existing buyer is chosen or a new one
 * is named — never both, never neither.
 */
export const PoDraftSchema = z
  .object({
    poNumber: z.string().min(1, "PO number is required"),
    buyerId: z.string().nullable().optional(),
    newBuyerName: z.string().min(1).nullable().optional(),
    poDate: isoDate,
    deliveryDate: isoDate.nullable(),
    currency: z.string().min(1).default("MYR"),
    buyerReference: z.string().nullable(),
    paymentTerms: z.string().nullable(),
    notes: z.string().nullable().optional(),
    lineItems: z.array(DraftLineItemSchema).min(1, "Add at least one line"),
    subtotal: decimalString("Subtotal"),
    tax: decimalString("Tax"),
    /** As printed on the document. Never recomputed — the gate compares to it. */
    total: decimalString("Total"),
  })
  .refine((draft) => Boolean(draft.buyerId) || Boolean(draft.newBuyerName), {
    message: "Choose a buyer",
    path: ["buyerId"],
  });

export type PoDraft = z.infer<typeof PoDraftSchema>;
export type DraftLineItem = z.infer<typeof DraftLineItemSchema>;

export const confirmOptionsSchema = z.object({
  revisedOf: z.string().nullable().optional(),
  totalsAcknowledged: z.boolean().optional(),
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
