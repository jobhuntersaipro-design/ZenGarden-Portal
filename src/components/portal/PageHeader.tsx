import type { ReactNode } from "react";

/**
 * Eyebrow above an h1, with a right-aligned action slot. Eyebrow is sentence
 * case — the design review dropped the ClickUp system's all-caps.
 *
 * The row wraps. It used to be a plain `justify-between` with a `shrink-0`
 * action, so on a 390px screen the Dashboard's "Upload PO" button — the
 * primary action on the page — was cut in half by the viewport edge, and
 * Products' "View only" pill and PO detail's "Download original" went the same
 * way (2026-09-06 review, A3/A4). Wrapped, the action drops under the title
 * instead of off the screen.
 */
export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-lg flex flex-wrap items-start justify-between gap-x-md gap-y-sm">
      {/* `min-w-0` so a long title wraps inside its own column rather than
          pushing the action out of the row it is supposed to share. */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {eyebrow}
        </p>
        {/* A step down on small screens: `display-md` is 34px, and "Upload
            purchase orders" at 34px took three lines of a phone. */}
        <h1 className="font-display text-[length:var(--text-heading-md)] leading-[1.2] font-[650] tracking-[-0.91px] text-ink sm:text-[length:var(--text-display-md)] sm:tracking-[-1.36px]">
          {title}
        </h1>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
