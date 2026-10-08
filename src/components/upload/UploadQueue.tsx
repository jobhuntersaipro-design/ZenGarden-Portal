"use client";

import { Progress } from "@/components/arc/progress/progress";
import arcProgress from "@/components/arc/progress/progress.module.css";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import type { UploadRow, UploadStatus } from "@/components/upload/queue-types";
import { formatBytes } from "@/lib/validation/upload";

/**
 * One geometry for every bar: Arc's progress track, full width, pill on both
 * track and fill. Only the fill colour and the row's label distinguish the
 * states — a taller or differently-rounded bar reads as a different kind of
 * progress (docs/specs/03-upload.md §2, design reference §3.3).
 */
/**
 * Arc's fill takes the status palette, so a row that needs a person stays
 * amber when it lands rather than turning Arc's done-green. Static strings,
 * because Tailwind only compiles classes it can read in the source.
 */
const ARC_FILL: Record<string, string> = {
  "bg-ink": "",
  "bg-surface-soft": "[&>div>span]:bg-surface-soft",
  "bg-accent-blue": "[&>div>span]:bg-accent-blue",
  "bg-brand-amber": "[&>div>span]:bg-brand-amber",
  "bg-accent-red": "[&>div>span]:bg-accent-red",
};

export function ProgressBar({
  value,
  fill,
  label,
  indeterminate = false,
}: {
  value: number;
  fill: string;
  /** Names the bar for assistive technology, such as the file it is for. */
  label?: string;
  indeterminate?: boolean;
}) {
  // Extraction reports no fraction, so the bar reports motion instead: Arc's
  // track, with our sliding fill, since Arc's progress has no indeterminate
  // state (G2).
  if (indeterminate) {
    return (
      <div
        className={arcProgress.track}
        role="progressbar"
        aria-label="Reading the document"
      >
        <div
          className={`h-full w-2/5 rounded-pill animate-indeterminate ${fill}`}
        />
      </div>
    );
  }

  return (
    <Progress
      value={Math.min(100, Math.max(0, value))}
      aria-label={label ?? "Upload progress"}
      className={ARC_FILL[fill] ?? ""}
    />
  );
}

/** Status text and badge colour. Every state carries its label (G2). */
const LABEL: Record<UploadStatus, string> = {
  queued: "Waiting",
  presigning: "Starting",
  uploading: "Uploading",
  extracting: "Extracting",
  ready: "Ready to review",
  failed: "Failed",
};

/**
 * One status palette (00-master.md §4). `accent-blue` means a process is
 * running right now; `brand-amber` means this needs a person.
 */
const TONE: Record<UploadStatus, string> = {
  queued: "text-ink-tertiary",
  presigning: "text-accent-blue",
  uploading: "text-accent-blue",
  extracting: "text-accent-blue",
  ready: "text-brand-amber",
  failed: "text-accent-red",
};

const FILL: Record<UploadStatus, string> = {
  queued: "bg-surface-soft",
  presigning: "bg-ink",
  uploading: "bg-ink",
  extracting: "bg-accent-blue",
  ready: "bg-brand-amber",
  failed: "bg-accent-red",
};

export function UploadQueue({
  rows,
  onRemove,
  onRetry,
  noun = "PO",
}: {
  rows: UploadRow[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** What is being uploaded, short: "PO" or "BC". */
  noun?: string;
}) {
  // The queue region exists before the first file, so choosing one fills a
  // space that is already there instead of pushing the footer down the page
  // (brief §9). An empty list that renders nothing is a layout shift waiting
  // to happen.
  if (rows.length === 0) {
    return (
      <p className="mt-md rounded-lg border border-dashed border-hairline bg-canvas p-md text-center text-[length:var(--text-body-sm)] text-ink-secondary">
        {/* "Drop" is desktop language; the phone's route in is the camera. */}
        <span className="sm:hidden">No files yet — add a {noun} above</span>
        <span className="hidden sm:inline">No files yet — drop {noun}s above</span>
      </p>
    );
  }

  return (
    <ul className="mt-md divide-y divide-hairline rounded-lg border border-hairline bg-canvas">
      {rows.map((row) => {
        const Icon = row.name.toLowerCase().endsWith(".pdf")
          ? FileText
          : ImageIcon;
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
              {row.status === "failed" && (row.file || row.extractionId) ? (
                <button
                  type="button"
                  onClick={() => onRetry(row.id)}
                  className="shrink-0 text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                aria-label={`Remove ${row.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-tertiary transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
              >
                <X className="size-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>
            <ProgressBar
              value={row.status === "ready" ? 100 : row.progress}
              fill={FILL[row.status]}
              label={`${row.name}: ${LABEL[row.status]}`}
              indeterminate={row.status === "extracting"}
            />
          </li>
        );
      })}
    </ul>
  );
}
