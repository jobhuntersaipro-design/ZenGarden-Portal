/**
 * The queue's vocabulary, kept apart from `useUploadQueue` so that anything
 * reasoning about a row — the footer's summary, the row renderer, their tests —
 * does not pull in the hook and, through it, the server actions and Auth.js.
 */
export type UploadStatus =
  | "queued"
  | "presigning"
  | "uploading"
  /** The bytes are in R2; Claude is reading them inside the complete request. */
  | "extracting"
  | "ready"
  | "failed";

export type UploadRow = {
  /** Client-side identity; the row exists before the server knows about it. */
  id: string;
  file: File | null;
  name: string;
  size: number;
  status: UploadStatus;
  /** 0-100, only meaningful while `uploading`. */
  progress: number;
  /** Plain language, shown under the filename. Always set on `failed`. */
  reason?: string;
  documentId?: string;
  extractionId?: string;
};

/**
 * The only state the footer counts. A row reaches it when extraction has
 * actually succeeded — an upload that landed but could not be read is `failed`,
 * so the footer never offers to review a file that cannot be reviewed.
 */
export const READY_STATUS: UploadStatus = "ready";

export const isActiveStatus = (status: UploadStatus) =>
  status === "presigning" || status === "uploading" || status === "extracting";
