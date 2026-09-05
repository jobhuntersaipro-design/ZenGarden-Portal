import { READY_STATUS, type UploadRow } from "@/components/upload/queue-types";

export type QueueSummary = {
  /** Rows the Review button will actually open. */
  ready: number;
  readyIds: string[];
  /** "1 still uploading · 1 failed", or null when nothing is left out. */
  excluded: string | null;
};

/**
 * What the sticky footer says. N counts rows in the ready state that have an
 * extraction to open — never failed, never uploading, never extracting, never
 * queued (docs/specs/03-upload.md §2). Whatever is being left behind is named
 * beside the button, because a button offering to review a file that cannot be
 * reviewed is a broken promise.
 */
export function summariseQueue(rows: UploadRow[]): QueueSummary {
  const readyIds = rows
    .filter((row) => row.status === READY_STATUS && row.extractionId)
    .map((row) => row.extractionId!);

  const uploading = rows.filter(
    (row) =>
      row.status === "queued" ||
      row.status === "presigning" ||
      row.status === "uploading",
  ).length;
  const extracting = rows.filter((row) => row.status === "extracting").length;
  const failed = rows.filter((row) => row.status === "failed").length;

  const parts = [
    uploading > 0 ? `${uploading} still uploading` : null,
    extracting > 0 ? `${extracting} still extracting` : null,
    failed > 0 ? `${failed} failed` : null,
  ].filter((part): part is string => part !== null);

  return {
    ready: readyIds.length,
    readyIds,
    excluded: parts.length > 0 ? parts.join(" · ") : null,
  };
}
