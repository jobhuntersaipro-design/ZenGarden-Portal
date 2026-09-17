"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { LOW_CONFIDENCE } from "@/lib/extraction/schema";

/**
 * A labelled field carrying its own confidence. Below 70 it turns amber and
 * says so — a warning only. It never blocks Confirm and plays no part in the
 * totals gate (docs/specs/04-extraction-review.md §3).
 */
export function Field({
  id,
  label,
  value,
  confidence,
  type = "text",
  min,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  confidence?: number;
  type?: string;
  /** The earliest value a date input's picker offers. */
  min?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const low = typeof confidence === "number" && confidence < LOW_CONFIDENCE;

  return (
    <div className="flex flex-col gap-xxs">
      <div className="flex items-baseline justify-between gap-sm">
        <label
          htmlFor={id}
          className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
        >
          {label}
        </label>
        {typeof confidence === "number" ? (
          <span
            className={`tabular-nums text-[length:var(--text-caption)] ${low ? "text-brand-amber" : "text-ink-tertiary"}`}
          >
            {Math.round(confidence)}
          </span>
        ) : null}
      </div>
      <Input
        id={id}
        type={type}
        min={min}
        value={value}
        title={value || undefined}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={
          [low ? `${id}-low` : null, error ? `${id}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        aria-invalid={error ? true : undefined}
        className={low ? "border-l-2 border-l-brand-amber" : undefined}
      />
      {low ? (
        <p
          id={`${id}-low`}
          className="text-[length:var(--text-caption)] text-brand-amber"
        >
          Low confidence — check source
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="text-[length:var(--text-caption)] text-accent-red"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A value the reviewer checks but cannot change — PO number and PO date since
 * 2026-09-17. Text in a tinted box at an input's height, so it lines up with
 * the editable fields beside it without looking like one of them.
 */
export function ReadOnlyField({
  id,
  label,
  value,
  confidence,
}: {
  id: string;
  label: string;
  value: string;
  confidence?: number;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-xxs">
      <div className="flex items-baseline justify-between gap-sm">
        <span
          id={`${id}-label`}
          className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
        >
          {label}
        </span>
        {typeof confidence === "number" ? (
          <span className="tabular-nums text-[length:var(--text-caption)] text-ink-tertiary">
            {Math.round(confidence)}
          </span>
        ) : null}
      </div>
      <p
        id={id}
        aria-labelledby={`${id}-label`}
        title={value}
        className="flex h-control-md min-w-0 items-center truncate rounded-sm bg-surface-soft px-2.5 text-[length:var(--text-body-md)] text-ink"
      >
        <span className="truncate">{value || "—"}</span>
      </p>
    </div>
  );
}

/** Same chrome as `Field` but wrapping something other than a text input. */
export function FieldShell({
  label,
  confidence,
  children,
}: {
  label: string;
  confidence?: number;
  children: ReactNode;
}) {
  const low = typeof confidence === "number" && confidence < LOW_CONFIDENCE;
  return (
    <div className="flex flex-col gap-xxs">
      <div className="flex items-baseline justify-between gap-sm">
        <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {label}
        </span>
        {typeof confidence === "number" ? (
          <span
            className={`tabular-nums text-[length:var(--text-caption)] ${low ? "text-brand-amber" : "text-ink-tertiary"}`}
          >
            {Math.round(confidence)}
          </span>
        ) : null}
      </div>
      {children}
      {low ? (
        <p className="text-[length:var(--text-caption)] text-brand-amber">
          Low confidence — check source
        </p>
      ) : null}
    </div>
  );
}
