import { z } from "zod";
import { optionalEmail, optionalText } from "@/lib/validation/common";

/**
 * The supplier contact details the public shop displays. Every field is
 * optional: a null means "fall back to the environment variable", which is
 * why the action trims `""` to null rather than storing it (§2).
 */
export const supplierPatchSchema = z.object({
  supplierName: optionalText(120),
  supplierEmail: optionalEmail,
  /** Unparsed: Malaysian numbers are written a dozen ways. */
  supplierPhone: optionalText(32),
  supplierAddress: optionalText(300),
});

export type SupplierPatch = z.input<typeof supplierPatchSchema>;
