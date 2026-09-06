import type { ReactNode } from "react";

/**
 * The bordered strip that holds a row of `ChoiceButton look="segment"` cells.
 *
 * A primitive rather than a class string repeated at five call sites, because
 * the class string was wrong at all five: `overflow-hidden` on a strip wider
 * than the viewport clips it with no way to reach the rest, and as a rigid
 * flex item it pushed the whole document sideways — 122px on the dashboard,
 * 38px on Products (2026-09-06 review, A3). `overflow-x-auto` with
 * `max-w-full` keeps the strip inside its column and lets a thumb reach the
 * last segment; `ChoiceButton`'s `shrink-0` stops the cells squeezing instead
 * of scrolling.
 */
export function SegmentGroup({
  label,
  hideLabel = false,
  busy,
  className = "",
  children,
}: {
  /**
   * The strip's accessible name, shown beside it unless `hideLabel`. Always an
   * `aria-label` — a strip of Grid/List icons needs a name even where the
   * design does not print one.
   */
  label: string;
  hideLabel?: boolean;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const strip = (
    <div
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      className={`flex max-w-full overflow-x-auto rounded-sm border border-hairline ${
        hideLabel ? className : ""
      }`}
    >
      {children}
    </div>
  );

  if (hideLabel) return strip;

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-xs ${className}`}>
      <span
        aria-hidden
        className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
      >
        {label}
      </span>
      {strip}
    </div>
  );
}
