"use client";

import { FileText, Image as ImageIcon, X } from "lucide-react";
import type { UploadRow, UploadStatus } from "@/hooks/useUploadQueue";
import { formatBytes } from "@/lib/validation/upload";

/**
 * One geometry for every bar: 4px, full width, `surface-soft` track, pill on
 * both track and fill. Only the fill colour and the row's label distinguish
 * the states — a taller or differently-rounded bar reads as a different kind
 * of progress (docs/specs/03-upload.md §2, design reference §3.3).
 */
function ProgressBar({ value, fill }: { value: number; fill: string }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-pill bg-surface-soft"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] ${fill}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/** Status text and badge colour. Every state carries its label (G2). */
const LABEL: Record<UploadStatus, string> = {
  queued: "Waiting",
  presigning: "Starting",
  uploading: "Uploading",
  completing: "Finishing",
  uploaded: "Uploaded",
  failed: "Failed",
};

const TONE: Record<UploadStatus, string> = {
  queued: "text-ink-tertiary",
  presigning: "text-accent-blue",
  uploading: "text-accent-blue",
  completing: "text-accent-blue",
  uploaded: "text-accent-green",
  failed: "text-accent-red",
};

export function UploadQueue({
  rows,
  onRemove,
  onRetry,
}: {
  rows: UploadRow[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <ul className="mt-md divide-y divide-hairline rounded-lg border border-hairline bg-canvas">
      {rows.map((row) => {
        const Icon = row.name.toLowerCase().endsWith(".pdf") ? FileText : ImageIcon;
        return (
          <li key={row.id} className="flex flex-col gap-xs p-md">
            <div className="flex items-center gap-sm">
              <Icon
                className="size-5 shrink-0 text-ink-tertiary"
                strokeWidth={1.75}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                {/* Ellipsised names always carry the full value (G4). */}
                <p
                  title={row.name}
                  className="truncate text-[length:var(--text-body-sm)] text-ink"
                >
                  {row.name}
                </p>
                {row.reason ? (
                  <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                    {row.reason}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
                {formatBytes(row.size)}
              </span>
              <span
                className={`shrink-0 rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${TONE[row.status]}`}
              >
                {LABEL[row.status]}
                {row.status === "uploading" ? ` ${row.progress}%` : null}
              </span>
              {row.status === "failed" && row.file ? (
                <button
                  type="button"
                  onClick={() => onRetry(row.id)}
                  className="shrink-0 text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                aria-label={`Remove ${row.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-tertiary transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <ProgressBar
              value={row.status === "uploaded" ? 100 : row.progress}
              fill={row.status === "uploaded" ? "bg-accent-green" : "bg-ink"}
            />
          </li>
        );
      })}
    </ul>
  );
}
