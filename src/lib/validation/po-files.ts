import { z } from "zod";
import { formatBytes } from "@/lib/validation/upload";
import { MAX_BUYER_DOCUMENT_BYTES, MAX_DOCUMENT_NAME_LENGTH } from "@/lib/validation/buyer-files";

/**
 * Files staff keep on one purchase order. The size limit is the account-level
 * document limit, so the two uploads cannot disagree about "too big". The
 * types are the ones whose bytes identify them on their own: PDF, JPG, PNG.
 * Account-level documents also accept Word, Excel and WebP; those are not
 * accepted here, because a zip or an OLE blob does not say which of them it is.
 */

export const PO_DOCUMENT_TYPES = {
  "application/pdf": { ext: "pdf" },
  "image/png": { ext: "png" },
  "image/jpeg": { ext: "jpg" },
} as const;

export type PoDocumentMimeType = keyof typeof PO_DOCUMENT_TYPES;

export const PO_DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg";

/** How many leading bytes `sniffPoDocumentMime` needs. PNG's signature is 8. */
export const PO_DOCUMENT_SIGNATURE_BYTES = 16;

/** Same ceiling as a buyer's account documents (`MAX_BUYER_DOCUMENT_BYTES`). */
export const MAX_PO_DOCUMENT_BYTES = MAX_BUYER_DOCUMENT_BYTES;

/**
 * Files on an order are not filed by category any more: staff upload what
 * they need. `PurchaseOrderDocument.category` is still NOT NULL, so every new
 * row carries this one value and no screen reads it.
 */
// ponytail: dead column kept to avoid a migration; drop it when one is due anyway.
export const PO_DOCUMENT_CATEGORY = "Document";

const BY_EXTENSION: Record<string, PoDocumentMimeType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export const isPoDocumentMimeType = (value: string): value is PoDocumentMimeType =>
  Object.prototype.hasOwnProperty.call(PO_DOCUMENT_TYPES, value);

/**
 * The browser's type when it names one on the list; the extension when the
 * browser said nothing. What the browser *did* say still has to be on the list.
 */
export function resolvePoDocumentType(name: string, type: string): PoDocumentMimeType | null {
  if (type && type !== "application/octet-stream") {
    return isPoDocumentMimeType(type) ? type : null;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean => {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
};

/**
 * What the bytes actually are. Offset 0 only: a file that hides another
 * format behind a preamble is not a document we will store.
 */
export function sniffPoDocumentMime(bytes: Uint8Array): PoDocumentMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

export const PO_DOCUMENT_WRONG_TYPE =
  "That file type isn't supported — use PDF, JPG or PNG";
export const PO_DOCUMENT_TOO_LARGE = (bytes: number) => {
  const shown = formatBytes(bytes);
  const limit = formatBytes(MAX_PO_DOCUMENT_BYTES);
  // A file a few bytes over the limit rounds to the same figure as the limit.
  if (shown === limit) return `That file is over the ${limit} limit`;
  return `That file is ${shown} — the limit is ${limit}`;
};
export const PO_DOCUMENT_EMPTY = "That file is empty";
export const PO_DOCUMENT_NAME_TOO_LONG = `That filename is too long — ${MAX_DOCUMENT_NAME_LENGTH} characters at most`;
export const PO_DOCUMENT_CONTENTS =
  "That file isn't a PDF, JPG or PNG — the contents don't match the type";

/** Name, declared type and size. The bytes are checked separately, once they exist. */
export function poDocumentRejectionReason(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!resolvePoDocumentType(file.name, file.type)) return PO_DOCUMENT_WRONG_TYPE;
  if (file.name.length > MAX_DOCUMENT_NAME_LENGTH) return PO_DOCUMENT_NAME_TOO_LONG;
  if (file.size <= 0) return PO_DOCUMENT_EMPTY;
  if (file.size > MAX_PO_DOCUMENT_BYTES) return PO_DOCUMENT_TOO_LARGE(file.size);
  return null;
}

/**
 * The declared type and the bytes have to name the same format. A `.pdf`
 * whose bytes are a JPEG is refused with `PO_DOCUMENT_CONTENTS`.
 */
export function poDocumentContentsReason(
  declared: PoDocumentMimeType,
  bytes: Uint8Array,
): string | null {
  return sniffPoDocumentMime(bytes) === declared ? null : PO_DOCUMENT_CONTENTS;
}

const fileSchema = z.object({
  name: z.string().min(1).max(1000),
  type: z.string().max(200),
  size: z.number().int(),
});

export const poDocumentPresignSchema = z.object({
  files: z.array(fileSchema).min(1).max(1),
});

/** What `complete` is told. Every field is checked again against R2 and the bytes. */
export const poDocumentCompleteSchema = z.object({
  key: z.string().min(1).max(300),
  name: z.string().min(1).max(MAX_DOCUMENT_NAME_LENGTH),
  type: z.string().max(200),
  size: z.number().int().positive().max(MAX_PO_DOCUMENT_BYTES),
});

/** `orders/{purchaseOrderId}/documents/{uuid}.{ext}` — the only shape `complete` accepts. */
export function purchaseOrderDocumentKey(
  purchaseOrderId: string,
  uuid: string,
  ext: string,
): string {
  return `orders/${purchaseOrderId}/documents/${uuid}.${ext}`;
}

export function isPurchaseOrderDocumentKey(
  key: string,
  purchaseOrderId: string,
  ext: string,
): boolean {
  const escaped = purchaseOrderId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (escaped !== purchaseOrderId || escaped.length === 0) return false;
  return new RegExp(
    `^orders/${escaped}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`,
  ).test(key);
}
