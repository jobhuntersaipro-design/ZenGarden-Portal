import { z } from "zod";

/** Field keys carrying their own confidence score, plus the line-item block. */
export const CONFIDENCE_FIELDS = [
  "poNumber",
  "buyerName",
  "poDate",
  "deliveryDate",
  "currency",
  "buyerReference",
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
export const PoExtractionSchema = z.object({
  poNumber: z.string().min(1),
  buyerName: z.string().min(1),
  poDate: isoDate,
  deliveryDate: isoDate.nullable(),
  currency: z.string().default("MYR"),
  buyerReference: z.string().nullable(),
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
