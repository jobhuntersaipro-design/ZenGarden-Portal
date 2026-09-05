import type { ReactNode } from "react";

/**
 * Field labels on the auth cards keep the mono family, eyebrow size and
 * tertiary colour but are sentence case, not uppercase (00-master.md §4).
 */
export function FieldLabel({
  htmlFor,
  children,
  action,
}: {
  htmlFor: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-sm">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
      >
        {children}
      </label>
      {action}
    </div>
  );
}
