import { z } from "zod";
import { CatalogLabelKind } from "@/generated/prisma/enums";

/**
 * 56 characters, the same ceiling the widest of the four product columns
 * carries (`market`). A value longer than its column could be created here
 * and then refused by the product form that has to store it.
 */
export const MAX_LABEL_LENGTH = 56;

export const labelValueSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .refine((value) => value.length > 0, "Type a value first")
  .refine(
    (value) => value.length <= MAX_LABEL_LENGTH,
    `Use at most ${MAX_LABEL_LENGTH} characters`,
  );

export const labelKindSchema = z.enum(CatalogLabelKind);

export const createLabelSchema = z.object({
  kind: labelKindSchema,
  value: labelValueSchema,
});

export const renameLabelSchema = z.object({
  id: z.string().min(1),
  value: labelValueSchema,
});

export type CreateLabelInput = z.input<typeof createLabelSchema>;
export type RenameLabelInput = z.input<typeof renameLabelSchema>;
