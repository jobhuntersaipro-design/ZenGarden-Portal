"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { LOW_CONFIDENCE } from "@/lib/extraction/schema";

/**
 * The review screen's field rows, laid out like Arc's document-extract block
 * (2026-10-27): grouped under a dotted heading, label on the left, the value,
 * and how sure AI was on the right. A value under LOW_CONFIDENCE asks for a
 * check — a warning only; it never blocks Confirm (04-extraction-review §3).
 */
export const isLow = (confidence: number | undefined) =>
  typeof confidence === "number" && confidence < LOW_CONFIDENCE;

const DOT = {
  ink: "bg-ink",
  green: "bg-accent-green",
  amber: "bg-brand-amber",
  purple: "bg-brand-link",
} as const;

export function ExtractGroup({
  label,
  meta,
  tone,
  action,
  children,
}: {
  label: string;
  meta?: ReactNode;
  tone: keyof typeof DOT;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-x-xs gap-y-xxs">
        <span aria-hidden className={`size-2 rounded-full ${DOT[tone]}`} />
        <h2 className="text-[length:var(--text-body-sm)] font-medium text-ink">{label}</h2>
        {meta ? (
          <span className="text-[length:var(--text-caption)] text-ink-tertiary">{meta}</span>
        ) : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Confidence({ value, checked }: { value?: number; checked?: boolean }) {
  if (typeof value !== "number") return null;
  const low = isLow(value) && !checked;
  return (
    <span
      className={`inline-flex items-center gap-xxs tabular-nums text-[length:var(--text-caption)] ${
        low ? "text-brand-amber-strong" : "text-ink-tertiary"
      }`}
    >
      {low ? <AlertTriangle aria-hidden className="size-3.5" strokeWidth={1.75} /> : null}
      {Math.round(value)}%
      {low ? <span className="sr-only"> — check this against the document</span> : null}
    </span>
  );
}

/**
 * One field. `checked` is the reviewer saying a low-confidence value is right,
 * by "Looks right" or by editing it; the parent holds it.
 */
export function ExtractRow({
  label,
  htmlFor,
  confidence,
  checked,
  onLooksRight,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  confidence?: number;
  checked?: boolean;
  onLooksRight?: () => void;
  error?: string;
  children: ReactNode;
}) {
  const flagged = isLow(confidence) && !checked;
  return (
    // Label above the value on a narrow pane, beside it from @sm.
    <div className="grid min-w-0 grid-cols-1 items-center gap-x-md gap-y-xxs @sm:grid-cols-extract-row">
      <label
        htmlFor={htmlFor}
        className="flex items-center justify-between gap-sm text-[length:var(--text-body-sm)] text-ink-secondary"
      >
        {label}
        <span className="@sm:hidden">
          <Confidence value={confidence} checked={checked} />
        </span>
      </label>
      <div
        className={`min-w-0 rounded-sm ${flagged ? "ring-1 ring-brand-amber ring-offset-1 ring-offset-surface" : ""}`}
      >
        {children}
      </div>
      <span className="hidden justify-self-end @sm:inline-flex">
        <Confidence value={confidence} checked={checked} />
      </span>
      {flagged || error ? (
        <div className="flex flex-wrap items-center justify-between gap-xs @sm:col-start-2">
          {error ? (
            <p className="text-[length:var(--text-caption)] text-accent-red">{error}</p>
          ) : (
            <p className="text-[length:var(--text-caption)] text-ink-secondary">
              Check this against the document.
            </p>
          )}
          {flagged && onLooksRight ? (
            <button
              type="button"
              onClick={onLooksRight}
              className="inline-flex min-h-11 items-center gap-xxs rounded-pill border border-hairline bg-surface px-sm text-[length:var(--text-caption)] text-ink transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-focus sm:min-h-8"
            >
              <Check aria-hidden className="size-3.5" strokeWidth={2} />
              Looks right
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const barHeight = (confidence: number) =>
  confidence >= 95 ? "h-full" : confidence >= 85 ? "h-4/5" : confidence >= LOW_CONFIDENCE ? "h-3/5" : "h-2/5";

/**
 * The footer's strip: one bar per field, its height the confidence. Amber
 * where a field still wants a check.
 */
export function ConfidenceBars({
  fields,
}: {
  fields: { key: string; confidence: number; flagged: boolean }[];
}) {
  return (
    <span aria-hidden className="flex h-5 items-end gap-0.5">
      {fields.map((field) => (
        <span
          key={field.key}
          className={`w-1 rounded-full ${barHeight(field.confidence)} ${
            field.flagged ? "bg-brand-amber" : "bg-accent-green"
          }`}
        />
      ))}
    </span>
  );
}
