import { z } from "zod";
import { formatBytes } from "@/lib/validation/upload";

/**
 * A buyer's logo and the documents staff keep against a buyer (2026-09-24).
 * One module for both so the two upload paths cannot disagree on what a file
 * name, a size or a folder is allowed to be.
 */

// ---- Logo -----------------------------------------------------------------

export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_ACCEPT_ATTRIBUTE = ".png,.jpg,.jpeg,.webp";
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
/** The box the stored PNG is fitted inside. Big enough for a 2× email header. */
export const LOGO_BOX = 512;
/** Past this the file is a photograph of a building, not a logo. */
export const LOGO_MAX_SOURCE_DIMENSION = 8000;

export const LOGO_WRONG_TYPE = "That file type isn't supported — use PNG, JPG or WebP";
export const LOGO_TOO_LARGE = (bytes: number) =>
  `That image is ${formatBytes(bytes)} — the limit is ${formatBytes(MAX_LOGO_BYTES)}`;

export function logoRejectionReason(file: { type: string; size: number }): string | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) return LOGO_WRONG_TYPE;
  if (file.size > MAX_LOGO_BYTES) return LOGO_TOO_LARGE(file.size);
  return null;
}

// ---- Documents ------------------------------------------------------------

/**
 * PDF and pictures preview in the page; Word and Excel download only, since a
 * browser cannot draw them. The extension is decided here, never taken from
 * the uploaded name, so a key can never carry `.html` or `.exe`.
 */
export const BUYER_DOCUMENT_TYPES = {
  "application/pdf": { ext: "pdf", preview: "pdf" },
  "image/png": { ext: "png", preview: "image" },
  "image/jpeg": { ext: "jpg", preview: "image" },
  "image/webp": { ext: "webp", preview: "image" },
  "application/msword": { ext: "doc", preview: null },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    ext: "docx",
    preview: null,
  },
  "application/vnd.ms-excel": { ext: "xls", preview: null },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    ext: "xlsx",
    preview: null,
  },
} as const;

export type BuyerDocumentMimeType = keyof typeof BUYER_DOCUMENT_TYPES;
export type DocumentPreviewKind = "pdf" | "image" | null;

export const BUYER_DOCUMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx";

export const MAX_BUYER_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_BUYER_DOCUMENTS_PER_CALL = 10;
export const MAX_DOCUMENT_NAME_LENGTH = 255;
export const MAX_FOLDER_LENGTH = 60;

export const isBuyerDocumentMimeType = (value: string): value is BuyerDocumentMimeType =>
  Object.prototype.hasOwnProperty.call(BUYER_DOCUMENT_TYPES, value);

export const previewKind = (mimeType: string): DocumentPreviewKind =>
  isBuyerDocumentMimeType(mimeType) ? BUYER_DOCUMENT_TYPES[mimeType].preview : null;

/**
 * Some browsers send an empty or generic type for Office files (Windows
 * without Office installed sends ""), so the type is read off the extension
 * when the browser did not say. What the browser *did* say still has to be on
 * the list.
 */
const BY_EXTENSION: Record<string, BuyerDocumentMimeType> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function resolveDocumentType(name: string, type: string): BuyerDocumentMimeType | null {
  if (type && type !== "application/octet-stream") {
    return isBuyerDocumentMimeType(type) ? type : null;
  }
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[ext] ?? null;
}

export const DOCUMENT_WRONG_TYPE =
  "That file type isn't supported — use PDF, an image, Word or Excel";
export const DOCUMENT_TOO_LARGE = (bytes: number) =>
  `That file is ${formatBytes(bytes)} — the limit is ${formatBytes(MAX_BUYER_DOCUMENT_BYTES)}`;
export const DOCUMENT_EMPTY = "That file is empty";
export const DOCUMENT_NAME_TOO_LONG = `That filename is too long — ${MAX_DOCUMENT_NAME_LENGTH} characters at most`;

export function documentRejectionReason(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!resolveDocumentType(file.name, file.type)) return DOCUMENT_WRONG_TYPE;
  if (file.name.length > MAX_DOCUMENT_NAME_LENGTH) return DOCUMENT_NAME_TOO_LONG;
  if (file.size <= 0) return DOCUMENT_EMPTY;
  if (file.size > MAX_BUYER_DOCUMENT_BYTES) return DOCUMENT_TOO_LARGE(file.size);
  return null;
}

/**
 * A folder name: trimmed, inner whitespace collapsed, never blank. Matched
 * against the existing folders case-insensitively by `canonicalFolder`, so
 * "contracts" typed today files beside yesterday's "Contracts".
 */
export const folderSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Choose a folder for these files.")
      .max(MAX_FOLDER_LENGTH, `A folder name is ${MAX_FOLDER_LENGTH} characters at most.`),
  );

export function canonicalFolder(folder: string, existing: readonly string[]): string {
  const match = existing.find((name) => name.toLowerCase() === folder.toLowerCase());
  return match ?? folder;
}

export const documentPresignSchema = z.object({
  folder: folderSchema,
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(1000),
        type: z.string().max(200),
        size: z.number().int(),
      }),
    )
    .min(1)
    .max(MAX_BUYER_DOCUMENTS_PER_CALL),
});

/** What `complete` is told; every field is checked again against R2 and the key. */
export const documentCompleteSchema = z.object({
  folder: folderSchema,
  key: z.string().min(1).max(300),
  name: z.string().min(1).max(MAX_DOCUMENT_NAME_LENGTH),
  type: z.string().max(200),
  size: z.number().int().positive().max(MAX_BUYER_DOCUMENT_BYTES),
});

/** `buyers/{buyerId}/documents/{uuid}.{ext}` — the only shape `complete` accepts. */
export function buyerDocumentKey(buyerId: string, uuid: string, ext: string): string {
  return `buyers/${buyerId}/documents/${uuid}.${ext}`;
}

export function isBuyerDocumentKey(key: string, buyerId: string, ext: string): boolean {
  const escaped = buyerId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (escaped !== buyerId) return false;
  return new RegExp(
    `^buyers/${escaped}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${ext}$`,
  ).test(key);
}

export function buyerLogoKey(buyerId: string, hash: string): string {
  return `buyers/${buyerId}/logo-${hash}.png`;
}

/**
 * Where a page draws the logo from. The hash in the stored key rides as `?v`,
 * so a replaced logo is a new URL and the old one can be cached forever.
 */
export function buyerLogoUrl(buyerId: string, logoKey: string | null): string | null {
  if (!logoKey) return null;
  const hash = /logo-([0-9a-f]+)\.png$/.exec(logoKey)?.[1] ?? "0";
  return `/api/buyers/${buyerId}/logo?v=${hash}`;
}

/**
 * A choice of any number of files, sent in the batches the presign route
 * takes. The limit is per request, not per choice: someone dropping thirty
 * scans should not be told to pick them ten at a time.
 */
export function batchesOf<T>(items: readonly T[], size = MAX_BUYER_DOCUMENTS_PER_CALL): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The folders the card lists: the ones holding files, plus the ones created on
 * this page that nothing has been filed into yet. A folder exists because a
 * file is in it, so an empty one lives only in the page until the first
 * upload — and a draft whose name now has files is not listed twice.
 */
export function withDraftFolders<T extends { name: string }>(
  folders: readonly T[],
  drafts: readonly string[],
  empty: (name: string) => T,
): T[] {
  const taken = new Set(folders.map((folder) => folder.name.toLowerCase()));
  const pending = drafts.filter((name) => !taken.has(name.toLowerCase())).map(empty);
  return [...folders, ...pending].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
