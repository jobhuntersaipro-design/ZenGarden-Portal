import { z } from "zod";

/** Field keys carrying their own confidence score, plus the line-item block. */
export const CONFIDENCE_FIELDS = [
  "poNumber",
  "buyerName",
  "poDate",
  "currency",
  "paymentTerms",
  "subtotal",
  "tax",
  "total",
  "lineItems",
] as const;

export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

/** Below this a field is flagged amber. A warning only — it never blocks confirm. */
export const LOW_CONFIDENCE = 70;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

export const PoLineItemSchema = z.object({
  description: z.string().min(1),
  /**
   * The item code as printed on the document, when it carries one.
   *
   * Read only so the line can be matched to a catalogue product — most POs
   * quote the supplier's own SKU, which is a far surer key than a description
   * a buyer may have retyped. Never shown in the form and never stored on the
   * line item; `toDraft` resolves it to a `productId` and drops it.
   */
  sku: z.string().nullable(),
  quantity: z.number().positive(),
  unit: z.string().nullable(),
  unitPrice: z.number().nonnegative(),
  amount: z.number().nonnegative(),
});

/**
 * What Claude returns. Money arrives as JSON numbers here and is turned into
 * Decimal strings the moment it becomes a draft, so a value is never rounded
 * through a float twice (docs/specs/04-extraction-review.md §1).
 */
/**
 * What the document is. A batch of uploads (a zip especially) can carry the
 * invoice, the packing list and the delivery order beside the PO; anything but
 * a purchase order is refused before it becomes a draft.
 */
export const DOCUMENT_KINDS = [
  "purchase_order",
  "invoice",
  "delivery_order",
  "packing_list",
  "quotation",
  "other",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const KIND_LABEL: Record<Exclude<DocumentKind, "purchase_order" | "other">, string> = {
  invoice: "an invoice",
  delivery_order: "a delivery order",
  packing_list: "a packing list",
  quotation: "a quotation",
};

/** The reason a refused upload shows. Points at where such a file does belong. */
export const notAPurchaseOrder = (kind: DocumentKind) => {
  const what =
    kind === "purchase_order" || kind === "other"
      ? "This doesn't look like a purchase order"
      : `This looks like ${KIND_LABEL[kind]}, not a purchase order`;
  return `${what} — attach it on the order's Documents card instead`;
};

export const PoExtractionSchema = z.object({
  /** First, so the model decides what it is reading before it fills a PO in. */
  documentKind: z.enum(DOCUMENT_KINDS),
  poNumber: z.string().min(1),
  buyerName: z.string().min(1),
  poDate: isoDate,
  currency: z.string().default("MYR"),
  paymentTerms: z.string().nullable(),
  lineItems: z.array(PoLineItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  total: z.number().nonnegative(),
  pageCount: z.number().int().positive(),
  confidence: z.object({
    overall: z.number().min(0).max(100),
    /**
     * Every key is required, not a free-form record.
     *
     * As a `z.record` this validated `{}`, and the model duly returned `{}` —
     * the structured-output schema was asking for "an object of numbers"
     * without naming a single key. That silently killed the whole per-field
     * confidence UI on the review screen: nothing could ever score under 70,
     * so no field was ever flagged. Naming the keys makes the model fill them.
     */
    fields: z.object(
      Object.fromEntries(
        CONFIDENCE_FIELDS.map((field) => [field, z.number().min(0).max(100)]),
      ) as Record<ConfidenceField, z.ZodNumber>,
    ),
  }),
});

export type PoExtraction = z.infer<typeof PoExtractionSchema>;
export type PoLineItem = z.infer<typeof PoLineItemSchema>;
