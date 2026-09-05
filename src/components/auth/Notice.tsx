import type { ReactNode } from "react";

export type NoticeTone = "error" | "success" | "info";

const TONE: Record<NoticeTone, string> = {
  error: "text-accent-red",
  success: "text-accent-green",
  info: "text-ink-secondary",
};

/**
 * The inline strip above an auth form (design reference §3.1): coloured text on
 * `surface-soft`, never a coloured fill.
 */
export function Notice({
  tone = "error",
  children,
}: {
  tone?: NoticeTone;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-sm bg-surface-soft px-sm py-xs text-[length:var(--text-body-sm)] ${TONE[tone]}`}
    >
      {children}
    </p>
  );
}
