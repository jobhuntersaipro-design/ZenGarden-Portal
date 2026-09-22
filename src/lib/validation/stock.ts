import { z } from "zod";
import { isoDate } from "@/lib/validation/purchase-orders";

/**
 * A stock count, from either entry path (Phase 55). The sheet and the single
 * form send the same shape, so one schema and one action serve both and the
 * history cannot differ by where it was typed.
 */
export const stockEntrySchema = z.object({
  productId: z.string().min(1),
  /** Zero is a count; below zero is not a quantity. */
  cartons: z
    .union([z.number(), z.string()])
    .transform((value, ctx) => {
      const raw = typeof value === "number" ? value : value.trim();
      const number = Number(raw);
      if (raw === "" || !Number.isInteger(number) || number < 0) {
        ctx.addIssue({
          code: "custom",
          message: "A count is a whole number of cartons, 0 or more",
        });
        return z.NEVER;
      }
      return number;
    }),
});

export const saveStockCountsSchema = z.object({
  /**
   * The day these are a count of. Defaults to today at the caller, never
   * here: a schema that quietly means "now" makes a historical count look
   * like a mistake rather than the ordinary act it is.
   */
  countedOn: isoDate,
  note: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(500, "That note is too long — 500 characters at most").nullable()),
  /** One or many. The sheet sends only the boxes that were filled in. */
  entries: z.array(stockEntrySchema).min(1, "Nothing was counted"),
});

export type SaveStockCountsInput = z.infer<typeof saveStockCountsSchema>;
