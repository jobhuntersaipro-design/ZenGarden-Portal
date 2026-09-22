import type { ReactNode } from "react";

/**
 * Eyebrow above an h1, with a right-aligned action slot. Eyebrow is sentence
 * case — the design review dropped the ClickUp system's all-caps.
 *
 * The row wraps, and below `sm` it always does. It used to be a plain
 * `justify-between` with a `shrink-0` action, so on a 390px screen the
 * Dashboard's "Upload PO" button — the primary action on the page — was cut in
 * half by the viewport edge (2026-09-06 review, A3/A4). `flex-wrap` was added
 * to drop the action under the title instead.
 *
 * **It never fired.** The title column was `flex-1`, which sets
 * `flex-basis: 0%`, so it shrank to nothing rather than overflowing the row —
 * and a row that never overflows never wraps. Measured at 390 on 2026-09-22:
 * the buyer page's h1 was **76px wide and 125px tall**, setting "Acme
 * Industrial Sdn Bhd" as four lines beside 274px of empty space, and PO
 * detail's was **45px** because Download + Edit + Delete took 261px of a 350px
 * row.
 *
 * `basis-full` below `sm` is the fix: the title takes the whole line, so the
 * action has to wrap under it. From `sm` up there is room to share, and the
 * old behaviour returns.
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
      {/* `basis-full` below `sm` forces the wrap; `min-w-0` keeps a long title
          wrapping inside its own column rather than pushing the action out of
          the row they share from `sm` up. */}
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
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
