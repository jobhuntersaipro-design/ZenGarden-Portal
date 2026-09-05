import type { ReactNode } from "react";

/**
 * Eyebrow above an h1, with a right-aligned action slot. Eyebrow is sentence
 * case — the design review dropped the ClickUp system's all-caps.
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
    <header className="mb-lg flex items-start justify-between gap-md">
      <div>
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          {eyebrow}
        </p>
        <h1 className="font-display text-[length:var(--text-display-md)] leading-[1.2] font-[650] tracking-[-1.36px] text-ink">
          {title}
        </h1>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
