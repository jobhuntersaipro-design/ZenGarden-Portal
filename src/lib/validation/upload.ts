import { z } from "zod";

/** PDF, PNG, JPG — docs/specs/00-master.md §1. */
export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_CALL = 10;
export const MAX_NAME_LENGTH = 255;

/** The `accept` attribute for the file input, kept next to the MIME list. */
export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg";

const EXTENSIONS: Record<AcceptedMimeType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const extensionFor = (mimeType: AcceptedMimeType) => EXTENSIONS[mimeType];

export const isAcceptedMimeType = (value: string): value is AcceptedMimeType =>
  (ACCEPTED_MIME_TYPES as readonly string[]).includes(value);

/**
 * Reasons are shown to the user under the filename, so they are written as
 * plain language rather than error codes (docs/specs/03-upload.md §2). The
 * size case names the actual size, because "too large" alone leaves the user
 * guessing by how much.
 */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const TOO_LARGE = (bytes: number) =>
  `File too large — ${formatBytes(bytes)}, limit is ${formatBytes(MAX_FILE_BYTES)}`;
export const WRONG_TYPE = "That file type isn't supported — PDF, PNG or JPG";
export const NAME_TOO_LONG = `That filename is too long — ${MAX_NAME_LENGTH} characters at most`;
export const TOO_MANY = `Too many files at once — ${MAX_FILES_PER_CALL} at a time`;

export const uploadFileSchema = z.object({
  name: z.string().min(1).max(MAX_NAME_LENGTH, NAME_TOO_LONG),
  type: z.string().refine(isAcceptedMimeType, WRONG_TYPE),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
});

export const presignRequestSchema = z.object({
  files: z.array(uploadFileSchema.loose()).min(1).max(MAX_FILES_PER_CALL, TOO_MANY),
});

export const completeRequestSchema = z.object({
  documentId: z.string().min(1),
  hintBuyerId: z.string().min(1).optional(),
});

export type UploadFileInput = z.infer<typeof uploadFileSchema>;

/**
 * The same check the client runs before it calls the server, so an obviously
 * bad file gets a row with a reason without a round trip. Returns null when the
 * file is fine.
 */
export function rejectionReason(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!isAcceptedMimeType(file.type)) return WRONG_TYPE;
  if (file.size > MAX_FILE_BYTES) return TOO_LARGE(file.size);
  if (file.name.length > MAX_NAME_LENGTH) return NAME_TOO_LONG;
  if (file.size <= 0) return "That file is empty";
  return null;
}
