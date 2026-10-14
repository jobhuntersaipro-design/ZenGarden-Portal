import { z } from "zod";
import { CERT_TYPES, DOC_TYPES } from "@/lib/certification";
import { ACCEPTED_MIME_TYPES, MAX_FILE_BYTES, MAX_NAME_LENGTH } from "@/lib/validation/upload";
import { isoDate } from "@/lib/validation/purchase-orders";

/** The only keys a certificate may point at: minted by our presign route. */
export const CERT_KEY = /^certificates\/[0-9a-f-]{36}\.(pdf|png|jpg)$/;

export const certificateFileSchema = z.object({
  key: z.string().regex(CERT_KEY, "That upload isn't one of ours."),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  type: z.enum(ACCEPTED_MIME_TYPES),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});

export const certificateSchema = z.object({
  type: z.enum(DOC_TYPES),
  reference: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((value) => value || null),
  expiresOn: isoDate,
  productIds: z.array(z.string().min(1)).max(2000),
  /** Present when creating, or when an edit replaces the file. */
  file: certificateFileSchema.nullish(),
});
export type CertificateInput = z.input<typeof certificateSchema>;

export const overrideSchema = z.object({
  productId: z.string().min(1),
  type: z.enum(CERT_TYPES),
  reason: z.string().trim().min(1, "Say why it is approved anyway.").max(500),
});
